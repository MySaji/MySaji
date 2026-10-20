"use server"

import { db } from "@/backend/db"
import { resolvePosActor } from "@/backend/services/pos-access-core"
import { parsePosConfig } from "@/backend/domain/pos-config"

export async function getTillTheme(): Promise<{ scope: string; color: string; canCustomize: boolean } | null> {
  const actor = await resolvePosActor()
  if (!actor?.shopkeeperId) return null
  const shop = await db.shopkeeperProfile.findUnique({ where: { id: actor.shopkeeperId }, select: { posConfig: true } })
  if (!shop) return null
  return { scope: `${actor.businessId}:${actor.shopkeeperId}`, color: parsePosConfig(shop.posConfig).primaryColor, canCustomize: actor.role === "OWNER" }
}
