"use server"

import { auth } from "@/backend/auth"
import { db } from "@/backend/db"
import { resolvePromoDiscount, type PromoResolution } from "@/backend/services/promo-code"

/** Live "Apply" preview on the cart page. checkout() in lib/actions/cart.ts
 * re-runs this same resolution server-side (against the transaction client)
 * before actually applying the discount — this call never itself commits
 * anything, it's purely informational. */
export async function validatePromoCode(code: string): Promise<PromoResolution> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }
  return resolvePromoDiscount(db, session.user.id, code)
}
