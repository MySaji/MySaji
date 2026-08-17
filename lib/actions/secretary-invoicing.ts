"use server"

import { db } from "@/lib/db"
import { requireSecretary } from "@/lib/actions/secretary-dashboard"
import { logAdminAction } from "@/lib/actions/admin-dashboard"
import { pushToUser } from "@/lib/actions/push"

export type SecretaryInvoice = {
  id: string
  invoiceNumber: string
  providerName: string
  customerName: string
  createdAt: string
  dueDate: string
  paidAt: string | null
  subtotal: number
  tax: number
  total: number
  status: "draft" | "sent" | "paid" | "overdue" | "cancelled"
}

const STATUS_TO_UI: Record<string, "draft" | "sent" | "paid" | "cancelled"> = {
  DRAFT: "draft", SENT: "sent", PAID: "paid", OVERDUE: "sent", CANCELLED: "cancelled",
}

export async function getSecretaryInvoices(): Promise<SecretaryInvoice[] | null> {
  const secretary = await requireSecretary()
  if (!secretary) return null

  const invoices = await db.invoice.findMany({
    include: { provider: { include: { user: { select: { name: true } } } }, customer: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 300,
  })

  const now = new Date()
  return invoices.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    providerName: inv.provider.businessName || inv.provider.user.name,
    customerName: inv.customer?.name ?? "Unknown client",
    createdAt: inv.createdAt.toISOString(),
    dueDate: inv.dueDate.toISOString(),
    paidAt: inv.paidAt?.toISOString() ?? null,
    subtotal: Number(inv.subtotal),
    tax: Number(inv.tax),
    total: Number(inv.total),
    status: inv.status === "SENT" && inv.dueDate < now ? "overdue" : STATUS_TO_UI[inv.status],
  }))
}

export type SecretaryInvoiceStats = { collected: number; pending: number; overdue: number; totalCount: number }

export async function getSecretaryInvoiceStats(): Promise<SecretaryInvoiceStats | null> {
  const invoices = await getSecretaryInvoices()
  if (!invoices) return null
  return {
    collected: invoices.filter((i) => i.status === "paid").reduce((a, i) => a + i.total, 0),
    pending: invoices.filter((i) => i.status === "sent").reduce((a, i) => a + i.total, 0),
    overdue: invoices.filter((i) => i.status === "overdue").reduce((a, i) => a + i.total, 0),
    totalCount: invoices.length,
  }
}

type ActionResult = { success: true } | { success: false; error: string }

export async function secretaryMarkInvoicePaid(invoiceId: string): Promise<ActionResult> {
  const secretary = await requireSecretary()
  if (!secretary) return { success: false, error: "Not authorized." }

  const invoice = await db.invoice.findUnique({ where: { id: invoiceId } })
  if (!invoice) return { success: false, error: "Invoice not found." }
  if (invoice.status !== "SENT") return { success: false, error: "Only sent invoices can be marked paid." }

  const provider = await db.providerProfile.findUnique({ where: { id: invoice.providerId } })
  if (!provider) return { success: false, error: "Provider not found." }

  const wallet = await db.wallet.findUnique({ where: { userId: provider.userId } })
  if (!wallet) return { success: false, error: "Provider wallet not found." }

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
        description: `Payment for invoice ${invoice.invoiceNumber} (recorded by secretary)`,
        referenceType: "INVOICE",
        referenceId: invoice.id,
        status: "COMPLETED",
        balanceBefore,
        balanceAfter,
      },
    }),
    db.notification.create({
      data: {
        userId: provider.userId,
        title: "Invoice marked as paid",
        message: `Invoice ${invoice.invoiceNumber} for KES ${amount.toLocaleString()} was recorded as paid.`,
        type: "PAYMENT",
        relatedType: "INVOICE",
        relatedId: invoice.id,
      },
    }),
  ])

  await pushToUser(provider.userId, {
    title: "Invoice marked as paid",
    body: `Invoice ${invoice.invoiceNumber} for KES ${amount.toLocaleString()} was recorded as paid.`,
    url: "/provider/wallet",
  }, "payment")

  await logAdminAction({
    userId: secretary.userId,
    action: "INVOICE_MARK_PAID",
    entityType: "Invoice",
    entityId: invoice.id,
    newValues: { status: "PAID" },
  })

  return { success: true }
}
