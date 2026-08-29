// Shared order-cancellation reversal — extracted from what was originally
// only the shopkeeper's cancelMyOrder() so a customer-initiated cancel can
// run the exact same, already-proven financial reversal instead of a second
// hand-rolled copy. Not a "use server" file: it's called from two different
// "use server" action files (lib/actions/shopkeeper-orders.ts and
// lib/actions/orders.ts), and a shared helper importable by both must not
// itself become a server-action boundary.
import { db } from "@/lib/db"

export type OrderReversalResult =
  | { success: true; total: number; orderNumber: string; customerId: string; shopkeeperUserId: string }
  | { success: false; error: string }

/** Reverses a not-yet-shipped order: restocks inventory, refunds the
 * customer's wallet, debits back the shopkeeper's payout (reading the exact
 * amount from the PlatformRevenue row recorded at checkout — not
 * recomputing commission, since a since-changed rate could cause drift),
 * and marks the order CANCELLED. Does not send notifications — the caller
 * knows who initiated the cancellation and messages the *other* party
 * accordingly, which differs between the shopkeeper- and customer-facing
 * callers. */
export async function reverseOrder(orderId: string): Promise<OrderReversalResult> {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { items: true } })
  if (!order) return { success: false, error: "Order not found." }
  if (order.status === "SHIPPED" || order.status === "DELIVERED" || order.status === "CANCELLED" || order.status === "REFUNDED") {
    return { success: false, error: "This order can no longer be cancelled." }
  }

  const shopkeeperProfile = await db.shopkeeperProfile.findUnique({ where: { id: order.shopkeeperId } })
  if (!shopkeeperProfile) return { success: false, error: "Shop not found." }

  const subtotal = Number(order.subtotal)
  const total = Number(order.total)

  const revenueEntry = await db.platformRevenue.findUnique({ where: { sourceId: order.id } })
  const payoutToReverse = revenueEntry ? Number(revenueEntry.payoutAmount) : subtotal

  await db.$transaction(async (tx) => {
    await tx.order.update({ where: { id: order.id }, data: { status: "CANCELLED", cancelledAt: new Date() } })

    if (revenueEntry && !revenueEntry.reversedAt) {
      await tx.platformRevenue.update({ where: { id: revenueEntry.id }, data: { reversedAt: new Date() } })
    }

    for (const item of order.items) {
      await tx.inventory.updateMany({ where: { productId: item.productId }, data: { currentStock: { increment: item.quantity } } })
      await tx.product.update({ where: { id: item.productId }, data: { totalSold: { decrement: item.quantity } } })
    }

    const customerWallet = await tx.wallet.upsert({
      where: { userId: order.customerId },
      update: {},
      create: { userId: order.customerId },
    })
    const custBefore = Number(customerWallet.balance)
    const custAfter = custBefore + total
    await tx.wallet.update({ where: { userId: order.customerId }, data: { balance: custAfter } })
    await tx.transaction.create({
      data: {
        walletId: customerWallet.id,
        type: "REFUND",
        amount: total,
        description: `Refund for cancelled order ${order.orderNumber}`,
        referenceType: "ORDER",
        referenceId: order.id,
        status: "COMPLETED",
        balanceBefore: custBefore,
        balanceAfter: custAfter,
      },
    })

    const shopWallet = await tx.wallet.upsert({
      where: { userId: shopkeeperProfile.userId },
      update: {},
      create: { userId: shopkeeperProfile.userId },
    })
    const shopBefore = Number(shopWallet.balance)
    const shopAfter = shopBefore - payoutToReverse
    await tx.wallet.update({
      where: { userId: shopkeeperProfile.userId },
      data: { balance: shopAfter, totalEarned: { decrement: payoutToReverse } },
    })
    await tx.transaction.create({
      data: {
        walletId: shopWallet.id,
        type: "DEBIT",
        amount: -payoutToReverse,
        description: `Order ${order.orderNumber} cancelled, payout reversed`,
        referenceType: "ORDER",
        referenceId: order.id,
        status: "COMPLETED",
        balanceBefore: shopBefore,
        balanceAfter: shopAfter,
      },
    })
    await tx.shopkeeperProfile.update({ where: { id: shopkeeperProfile.id }, data: { totalSales: { decrement: subtotal } } })
  }, { timeout: 20000, maxWait: 10000 })

  return { success: true, total, orderNumber: order.orderNumber, customerId: order.customerId, shopkeeperUserId: shopkeeperProfile.userId }
}
