// Shared promo/coupon-code resolution — used both for the cart page's live
// "Apply" preview (lib/actions/promo.ts, via the plain db client) and for
// checkout()'s authoritative re-validation (lib/actions/cart.ts, via the
// transaction client) so the exact same eligibility/discount math runs in
// both places. Not a "use server" file for the same reason
// lib/order-cancellation.ts isn't one.
import { db } from "@/backend/db"

// Structural subset so this accepts either the plain db client or a
// Prisma $transaction callback's `tx` client — both expose these same
// model delegates, just under different top-level types.
type QueryClient = Pick<typeof db, "promotion" | "cartItem">

export type PromoResolution =
  | { success: true; promotionId: string; shopkeeperId: string; shopName: string; discountAmount: number; eligibleSubtotal: number }
  | { success: false; error: string }

/** Looks up a Promotion by its customer-entered code and checks it against
 * this specific customer's current cart. Promotions are shop-owned
 * (Promotion.shopkeeperId is required), so a code only ever discounts the
 * items in the cart belonging to that one shop — never the whole cart. */
export async function resolvePromoDiscount(client: QueryClient, customerId: string, rawCode: string): Promise<PromoResolution> {
  const code = rawCode.trim().toUpperCase()
  if (!code) return { success: false, error: "Enter a code." }

  const promotion = await client.promotion.findUnique({
    where: { code },
    include: { shopkeeper: { select: { shopName: true } } },
  })
  if (!promotion) return { success: false, error: "That code isn't valid." }
  if (promotion.type === "BOGO") return { success: false, error: "This code type can't be applied at checkout yet. Contact the shop." }

  const now = new Date()
  if (promotion.status !== "ACTIVE") return { success: false, error: "This code isn't active." }
  if (now < promotion.startDate) return { success: false, error: "This code isn't active yet." }
  if (promotion.endDate && now > promotion.endDate) return { success: false, error: "This code has expired." }
  if (promotion.maxUses != null && promotion.usedCount >= promotion.maxUses) {
    return { success: false, error: "This code has reached its usage limit." }
  }

  // The `product: {...}` relation filter below only ever matches rows where
  // productId is actually set (CartItem's service lines have a null
  // product and so never match), even though the schema itself still types
  // item.product as nullable — hence the `!` assertions on it below.
  const cartItems = await client.cartItem.findMany({
    where: { customerId, product: { shopkeeperId: promotion.shopkeeperId } },
    include: { product: true },
  })
  if (cartItems.length === 0) return { success: false, error: `Your cart has no items from ${promotion.shopkeeper.shopName}.` }

  const eligibleItems = promotion.categoryId
    ? cartItems.filter((item) => item.product!.categoryId === promotion.categoryId)
    : cartItems
  if (eligibleItems.length === 0) {
    return { success: false, error: `This code only applies to specific items from ${promotion.shopkeeper.shopName}.` }
  }

  const eligibleSubtotal = eligibleItems.reduce((sum, item) => sum + Number(item.product!.discountPrice ?? item.product!.price) * item.quantity, 0)
  if (eligibleSubtotal < Number(promotion.minOrder)) {
    return { success: false, error: `Add at least KES ${Number(promotion.minOrder).toLocaleString()} from ${promotion.shopkeeper.shopName} to use this code.` }
  }

  const discountAmount = promotion.type === "PERCENTAGE"
    ? Math.round(eligibleSubtotal * (Number(promotion.value) / 100) * 100) / 100
    : Math.min(Number(promotion.value), eligibleSubtotal)

  return {
    success: true,
    promotionId: promotion.id,
    shopkeeperId: promotion.shopkeeperId,
    shopName: promotion.shopkeeper.shopName,
    discountAmount,
    eligibleSubtotal,
  }
}
