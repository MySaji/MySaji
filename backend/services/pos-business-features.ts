import { db } from "@/backend/db"
import { posBusinessFeatures } from "@/backend/domain/pos-business-features"

export async function loadPosBusinessFeatures(shopkeeperId: string) {
  const shop = await db.shopkeeperProfile.findUnique({ where: { id: shopkeeperId }, select: { posProfileKey: true, posTraits: true, posConfig: true } })
  return shop ? posBusinessFeatures(shop) : null
}
