"use server"

import { z } from "zod"
import { db } from "@/lib/db"
import { requireShopkeeper } from "@/lib/actions/shopkeeper-dashboard"

export type ShopCustomerOrderSummary = { id: string; orderNumber: string; date: string; amount: number; status: string }

export type ShopCustomer = {
  id: string
  name: string
  phone: string | null
  avatar: string | null
  totalOrders: number
  totalSpent: number
  lastOrderDate: string
  customerSince: string
  isBlocked: boolean
  blockedReason: string | null
  orders: ShopCustomerOrderSummary[]
}

export async function getShopCustomers(): Promise<ShopCustomer[]> {
  const shopkeeper = await requireShopkeeper()
  if (!shopkeeper) return []

  const [orders, blocked] = await Promise.all([
    db.order.findMany({
      where: { shopkeeperId: shopkeeper.shopkeeperId },
      orderBy: { createdAt: "desc" },
      include: { customer: true },
    }),
    db.blockedShopCustomer.findMany({ where: { shopkeeperId: shopkeeper.shopkeeperId } }),
  ])

  const blockedByCustomer = new Map(blocked.map((b) => [b.customerId, b.reason]))

  const byCustomer = new Map<string, typeof orders>()
  for (const order of orders) {
    const list = byCustomer.get(order.customerId) ?? []
    list.push(order)
    byCustomer.set(order.customerId, list)
  }

  const customers: ShopCustomer[] = []
  for (const [customerId, customerOrders] of byCustomer) {
    const customer = customerOrders[0].customer
    const completedOrders = customerOrders.filter((o) => o.status === "DELIVERED")
    const totalSpent = completedOrders.reduce((sum, o) => sum + Number(o.total), 0)
    const oldest = [...customerOrders].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0]

    customers.push({
      id: customerId,
      name: customer.name,
      // Real phone numbers never leave the server to another user — Message
      // goes through the in-app conversation system (id above), never a
      // raw tel: link.
      phone: null,
      avatar: customer.image,
      totalOrders: customerOrders.length,
      totalSpent,
      lastOrderDate: customerOrders[0].createdAt.toISOString(),
      customerSince: oldest.createdAt.toISOString(),
      isBlocked: blockedByCustomer.has(customerId),
      blockedReason: blockedByCustomer.get(customerId) ?? null,
      orders: customerOrders.slice(0, 5).map((o) => ({
        id: o.id, orderNumber: o.orderNumber, date: o.createdAt.toISOString(), amount: Number(o.total), status: o.status,
      })),
    })
  }

  return customers.sort((a, b) => b.totalSpent - a.totalSpent)
}

export type ShopCustomerActionResult = { success: true } | { success: false; error: string }

const blockCustomerSchema = z.object({
  customerId: z.string().trim().min(1),
  reason: z.string().trim().max(300).optional(),
})

/** Blocking is enforced server-side, not just hidden in the UI — addToCart()
 * and checkout() (lib/actions/cart.ts) both check this same
 * BlockedShopCustomer row before letting the blocked customer buy from this
 * shop, mirroring how BlockedClient already gates provider bookings. */
export async function blockShopCustomer(input: unknown): Promise<ShopCustomerActionResult> {
  const shopkeeper = await requireShopkeeper()
  if (!shopkeeper) return { success: false, error: "You must be signed in as a shopkeeper." }

  const parsed = blockCustomerSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  await db.blockedShopCustomer.upsert({
    where: { shopkeeperId_customerId: { shopkeeperId: shopkeeper.shopkeeperId, customerId: parsed.data.customerId } },
    update: { reason: parsed.data.reason },
    create: { shopkeeperId: shopkeeper.shopkeeperId, customerId: parsed.data.customerId, reason: parsed.data.reason },
  })
  return { success: true }
}

const customerIdSchema = z.object({ customerId: z.string().trim().min(1) })

export async function unblockShopCustomer(input: unknown): Promise<ShopCustomerActionResult> {
  const shopkeeper = await requireShopkeeper()
  if (!shopkeeper) return { success: false, error: "You must be signed in as a shopkeeper." }

  const parsed = customerIdSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  await db.blockedShopCustomer.deleteMany({ where: { shopkeeperId: shopkeeper.shopkeeperId, customerId: parsed.data.customerId } })
  return { success: true }
}
