"use server"

import { z } from "zod"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { requirePro } from "@/lib/actions/provider-subscription"

async function requireProvider(): Promise<{ userId: string; providerId: string } | null> {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== "provider") return null
  const profile = await db.providerProfile.findUnique({ where: { userId: session.user.id } })
  if (!profile) return null
  return { userId: session.user.id, providerId: profile.id }
}

export type MyProductItem = {
  offerId: string
  title: string
  image: string | null
  price: number | null
  status: "DRAFT" | "UNDER_REVIEW" | "LIVE"
  stockQuantity: number | null
  bookingCount: number
}

/** A provider's own BUY-actionType Offers, viewed as "products" — the same
 * rows /provider/offers already manages (create/edit/publish all stay
 * there, unchanged), filtered down and given the stock column that page
 * doesn't show. Pro-gated as a convenience layer on top of capability every
 * provider already has for free today (anyone can create a BUY offer) —
 * this doesn't take anything away from non-Pro providers, only adds. */
export async function getMyProducts(): Promise<MyProductItem[]> {
  const provider = await requireProvider()
  if (!provider) return []
  const denied = await requirePro()
  if (denied) return []

  const offers = await db.offer.findMany({
    where: { providerId: provider.providerId, actionType: "BUY" },
    orderBy: { createdAt: "desc" },
  })
  return offers.map((o) => ({
    offerId: o.id,
    title: o.title,
    image: o.images[0] ?? null,
    price: o.price != null ? Number(o.price) : null,
    status: o.status,
    stockQuantity: o.stockQuantity,
    bookingCount: o.bookingCount,
  }))
}

const updateStockSchema = z.object({
  offerId: z.string().trim().min(1),
  // null clears tracking back to "unlimited/not tracked" — the pre-existing
  // default for every offer before this field existed.
  stockQuantity: z.number().int().min(0).max(100000).nullable(),
})

export type ProviderProductActionResult = { success: true } | { success: false; error: string; requiresPro?: true }

export async function updateProductStock(input: unknown): Promise<ProviderProductActionResult> {
  const provider = await requireProvider()
  if (!provider) return { success: false, error: "You must be signed in as a provider." }
  const denied = await requirePro()
  if (denied) return denied

  const parsed = updateStockSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const offer = await db.offer.findUnique({ where: { id: parsed.data.offerId }, select: { providerId: true, actionType: true } })
  if (!offer || offer.providerId !== provider.providerId) return { success: false, error: "Product not found." }
  if (offer.actionType !== "BUY") return { success: false, error: "Only Buy-type offers track stock." }

  await db.offer.update({ where: { id: parsed.data.offerId }, data: { stockQuantity: parsed.data.stockQuantity } })
  return { success: true }
}

export type MyProductOrderItem = {
  jobId: string
  offerId: string
  productTitle: string
  buyerId: string
  buyerName: string
  buyerAvatar: string | null
  quantity: number
  price: number
  currency: string
  status: string
  location: string
  createdAt: string
}

/** A provider's Jobs that came from a BUY offer — the same Job rows
 * /provider/jobs already manages (identical statuses, identical
 * accept/start/complete actions from lib/actions/provider-jobs.ts — no new
 * fulfillment pipeline here), just filtered down to what a provider would
 * actually recognize as "orders," since that page otherwise mixes them in
 * unlabeled alongside real service bookings. */
export async function getMyProductOrders(): Promise<MyProductOrderItem[]> {
  const provider = await requireProvider()
  if (!provider) return []
  const denied = await requirePro()
  if (denied) return []

  const jobs = await db.job.findMany({
    where: {
      providerId: provider.providerId,
      status: { not: "PENDING_PAYMENT" },
      offer: { actionType: "BUY" },
    },
    include: { customer: true, offer: { select: { title: true } } },
    orderBy: { createdAt: "desc" },
  })

  return jobs.map((j) => ({
    jobId: j.id,
    offerId: j.offerId ?? "",
    productTitle: j.offer?.title ?? j.title,
    buyerId: j.customerId,
    buyerName: j.customer.name,
    buyerAvatar: j.customer.image,
    quantity: j.quantity,
    price: Number(j.price),
    currency: j.currency,
    status: j.status,
    location: j.location,
    createdAt: j.createdAt.toISOString(),
  }))
}
