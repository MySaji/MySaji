"use server"
import { activeUser } from "@/backend/services/active-user"
import { posShopIdFor } from "@/backend/services/pos-tenant"

export async function getPosOfflineContext() {
  const user = await activeUser()
  if (!user) return null
  const shopId = await posShopIdFor(user.id)
  return shopId ? { userId: user.id, shopId } : null
}
