"use server"

import { z } from "zod"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { requirePro } from "@/lib/actions/provider-subscription"
import { notifyUser } from "@/lib/actions/notify"

async function requireProvider(): Promise<{ userId: string; providerId: string } | null> {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== "provider") return null
  const profile = await db.providerProfile.findUnique({ where: { userId: session.user.id } })
  if (!profile) return null
  return { userId: session.user.id, providerId: profile.id }
}

export type BillingClientOption = { id: string; name: string; phone: string | null }

export async function getBillingClientOptions(): Promise<BillingClientOption[]> {
  const provider = await requireProvider()
  if (!provider) return []

  const jobs = await db.job.findMany({
    where: { providerId: provider.providerId },
    select: { customer: { select: { id: true, name: true, phone: true } } },
    distinct: ["customerId"],
  })
  return jobs.map((j) => j.customer)
}

const TAX_RATE = 0.16

const itemSchema = z.object({
  description: z.string().trim().min(1, "Item description is required"),
  quantity: z.number().int().min(1),
  rate: z.number().min(0),
})

// ============================= INVOICES =============================

export type ProviderInvoiceItem = { description: string; quantity: number; rate: number }
export type ProviderInvoice = {
  id: string
  invoiceNumber: string
  customerId: string | null
  customerName: string
  customerPhone: string | null
  createdAt: string
  dueDate: string
  paidAt: string | null
  subtotal: number
  tax: number
  total: number
  status: "draft" | "sent" | "paid" | "overdue" | "cancelled"
  items: ProviderInvoiceItem[]
}

const STATUS_TO_UI: Record<string, "draft" | "sent" | "paid" | "cancelled"> = {
  DRAFT: "draft", SENT: "sent", PAID: "paid", OVERDUE: "sent", CANCELLED: "cancelled",
}

export async function getProviderInvoices(): Promise<ProviderInvoice[]> {
  const provider = await requireProvider()
  if (!provider) return []

  const invoices = await db.invoice.findMany({
    where: { providerId: provider.providerId },
    include: { customer: true, items: true },
    orderBy: { createdAt: "desc" },
  })

  const now = new Date()
  return invoices.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    customerId: inv.customerId,
    customerName: inv.customer?.name ?? "Unknown client",
    // Real phone numbers never leave the server to another user — Call and
    // Message both go through the in-app conversation/voice-call system
    // (customerId above), never a raw tel: link.
    customerPhone: null,
    createdAt: inv.createdAt.toISOString(),
    dueDate: inv.dueDate.toISOString(),
    paidAt: inv.paidAt?.toISOString() ?? null,
    subtotal: Number(inv.subtotal),
    tax: Number(inv.tax),
    total: Number(inv.total),
    status: inv.status === "SENT" && inv.dueDate < now ? "overdue" : STATUS_TO_UI[inv.status],
    items: inv.items.map((i) => ({ description: i.description, quantity: i.quantity, rate: Number(i.rate) })),
  }))
}

export type ProviderInvoiceStats = { collected: number; pending: number; overdue: number }

export async function getProviderInvoiceStats(): Promise<ProviderInvoiceStats> {
  const invoices = await getProviderInvoices()
  return {
    collected: invoices.filter((i) => i.status === "paid").reduce((a, i) => a + i.total, 0),
    pending: invoices.filter((i) => i.status === "sent").reduce((a, i) => a + i.total, 0),
    overdue: invoices.filter((i) => i.status === "overdue").reduce((a, i) => a + i.total, 0),
  }
}

export type ProviderBillingActionResult = { success: true } | { success: false; error: string }

const createInvoiceSchema = z.object({
  customerId: z.string().trim().min(1, "Please select a client"),
  dueDate: z.string().min(1, "Due date is required"),
  items: z.array(itemSchema).min(1, "Add at least one line item"),
})

export async function createProviderInvoice(input: unknown): Promise<ProviderBillingActionResult> {
  const provider = await requireProvider()
  if (!provider) return { success: false, error: "You must be signed in as a provider." }
  const denied = await requirePro()
  if (denied) return denied

  const parsed = createInvoiceSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const { customerId, dueDate, items } = parsed.data

  const due = new Date(dueDate)
  if (Number.isNaN(due.getTime())) return { success: false, error: "Invalid due date" }

  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.rate, 0)
  const tax = Math.round(subtotal * TAX_RATE)
  const total = subtotal + tax
  const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`

  await db.invoice.create({
    data: {
      invoiceNumber,
      providerId: provider.providerId,
      customerId,
      dueDate: due,
      subtotal,
      tax,
      total,
      items: { create: items.map((item) => ({ description: item.description, quantity: item.quantity, rate: item.rate })) },
    },
  })

  return { success: true }
}

const invoiceIdSchema = z.object({ id: z.string().trim().min(1) })

export async function sendProviderInvoice(input: unknown): Promise<ProviderBillingActionResult> {
  const provider = await requireProvider()
  if (!provider) return { success: false, error: "You must be signed in as a provider." }
  const parsed = invoiceIdSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const invoice = await db.invoice.findUnique({ where: { id: parsed.data.id } })
  if (!invoice || invoice.providerId !== provider.providerId) return { success: false, error: "Invoice not found." }
  if (invoice.status !== "DRAFT") return { success: false, error: "Only draft invoices can be sent." }

  await db.invoice.update({ where: { id: invoice.id }, data: { status: "SENT" } })

  if (invoice.customerId) {
    await notifyUser({
      userId: invoice.customerId,
      title: "New invoice",
      message: `Invoice ${invoice.invoiceNumber} for KES ${Number(invoice.total).toLocaleString()} is ready.`,
      type: "PAYMENT",
      relatedType: "INVOICE",
      relatedId: invoice.id,
      actionUrl: "/customer/wallet",
    })
  }

  return { success: true }
}

export async function markProviderInvoicePaid(input: unknown): Promise<ProviderBillingActionResult> {
  const provider = await requireProvider()
  if (!provider) return { success: false, error: "You must be signed in as a provider." }
  const parsed = invoiceIdSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const invoice = await db.invoice.findUnique({ where: { id: parsed.data.id } })
  if (!invoice || invoice.providerId !== provider.providerId) return { success: false, error: "Invoice not found." }
  if (invoice.status !== "SENT") return { success: false, error: "Only sent invoices can be marked paid." }

  const wallet = await db.wallet.findUnique({ where: { userId: provider.userId } })
  if (!wallet) return { success: false, error: "Wallet not found." }

  const amount = Number(invoice.total)
  const balanceBefore = Number(wallet.balance)
  const balanceAfter = balanceBefore + amount

  await db.$transaction([
    db.invoice.update({ where: { id: invoice.id }, data: { status: "PAID", paidAt: new Date() } }),
    db.wallet.update({ where: { id: wallet.id }, data: { balance: balanceAfter, totalEarned: { increment: amount } } }),
    db.transaction.create({
      data: {
        walletId: wallet.id,
        type: "CREDIT",
        amount,
        description: `Payment for invoice ${invoice.invoiceNumber}`,
        referenceType: "INVOICE",
        referenceId: invoice.id,
        status: "COMPLETED",
        balanceBefore,
        balanceAfter,
      },
    }),
  ])

  return { success: true }
}

export async function cancelProviderInvoice(input: unknown): Promise<ProviderBillingActionResult> {
  const provider = await requireProvider()
  if (!provider) return { success: false, error: "You must be signed in as a provider." }
  const parsed = invoiceIdSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const invoice = await db.invoice.findUnique({ where: { id: parsed.data.id } })
  if (!invoice || invoice.providerId !== provider.providerId) return { success: false, error: "Invoice not found." }
  if (invoice.status === "PAID") return { success: false, error: "Paid invoices can't be cancelled." }

  await db.invoice.update({ where: { id: invoice.id }, data: { status: "CANCELLED" } })
  return { success: true }
}

// ============================== QUOTES ==============================

export type ProviderQuoteItem = { description: string; quantity: number; rate: number }
export type ProviderQuote = {
  id: string
  jobTitle: string
  customerId: string | null
  customerName: string
  description: string | null
  amount: number
  validUntil: string
  notes: string | null
  status: "draft" | "sent" | "accepted" | "rejected" | "expired"
  createdAt: string
  items: ProviderQuoteItem[]
}

export async function getProviderQuotes(): Promise<ProviderQuote[]> {
  const provider = await requireProvider()
  if (!provider) return []

  const quotes = await db.quote.findMany({
    where: { providerId: provider.providerId },
    include: { customer: true, items: true },
    orderBy: { createdAt: "desc" },
  })

  return quotes.map((q) => ({
    id: q.id,
    jobTitle: q.jobTitle,
    customerId: q.customerId,
    customerName: q.customer?.name ?? "Unknown client",
    description: q.description,
    amount: Number(q.amount),
    validUntil: q.validUntil.toISOString(),
    notes: q.notes,
    status: q.status.toLowerCase() as ProviderQuote["status"],
    createdAt: q.createdAt.toISOString(),
    items: q.items.map((i) => ({ description: i.description, quantity: i.quantity, rate: Number(i.rate) })),
  }))
}

const createQuoteSchema = z.object({
  jobTitle: z.string().trim().min(1, "Job title is required"),
  customerId: z.string().trim().min(1, "Please select a client"),
  description: z.string().trim().optional(),
  validDays: z.number().int().min(1).max(90),
  notes: z.string().trim().optional(),
  items: z.array(itemSchema).min(1, "Add at least one line item"),
})

export async function createProviderQuote(input: unknown): Promise<ProviderBillingActionResult> {
  const provider = await requireProvider()
  if (!provider) return { success: false, error: "You must be signed in as a provider." }
  const denied = await requirePro()
  if (denied) return denied

  const parsed = createQuoteSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const { jobTitle, customerId, description, validDays, notes, items } = parsed.data

  const amount = items.reduce((sum, item) => sum + item.quantity * item.rate, 0)
  const validUntil = new Date(Date.now() + validDays * 86400000)

  await db.quote.create({
    data: {
      jobTitle,
      providerId: provider.providerId,
      customerId,
      description: description || null,
      amount,
      validUntil,
      notes: notes || null,
      items: { create: items.map((item) => ({ description: item.description, quantity: item.quantity, rate: item.rate })) },
    },
  })

  return { success: true }
}

const quoteIdSchema = z.object({ id: z.string().trim().min(1) })

export async function sendProviderQuote(input: unknown): Promise<ProviderBillingActionResult> {
  const provider = await requireProvider()
  if (!provider) return { success: false, error: "You must be signed in as a provider." }
  const parsed = quoteIdSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const quote = await db.quote.findUnique({ where: { id: parsed.data.id } })
  if (!quote || quote.providerId !== provider.providerId) return { success: false, error: "Quote not found." }
  if (quote.status !== "DRAFT") return { success: false, error: "Only draft quotes can be sent." }

  await db.quote.update({ where: { id: quote.id }, data: { status: "SENT" } })

  if (quote.customerId) {
    await notifyUser({
      userId: quote.customerId,
      title: "New quote received",
      message: `${quote.jobTitle}: KES ${Number(quote.amount).toLocaleString()}`,
      type: "SYSTEM",
      relatedType: "QUOTE",
      relatedId: quote.id,
    })
  }

  return { success: true }
}
