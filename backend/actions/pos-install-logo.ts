"use server"

import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"
import { db } from "@/backend/db"
import { resolvePosActor, recordPosAudit } from "@/backend/services/pos-access-core"
import { validInstallLogo, renderInstallLogo } from "@/backend/services/pos-install-brand"
import { getTillAddress } from "@/backend/actions/pos-install"

export async function getTillLogoSettings() {
  const actor = await resolvePosActor()
  if (!actor?.shopkeeperId || !actor.can("settings.store")) return null
  const [shop, owned] = await Promise.all([
    db.shopkeeperProfile.findUnique({ where: { id: actor.shopkeeperId }, select: { shopName: true, posConfig: true, tillSlug: true } }),
    db.posBusiness.findUnique({ where: { id: actor.businessId }, select: { ownerUserId: true } }),
  ])
  if (!shop) return null
  const config = shop.posConfig as Record<string, unknown> | null
  return { name: shop.shopName, slug: shop.tillSlug, logo: validInstallLogo(config?.installLogo) ? config.installLogo : null, canChange: owned?.ownerUserId === actor.userId && actor.role === "OWNER" }
}

export async function saveTillLogo(input: unknown) {
  const actor = await resolvePosActor()
  if (!actor?.shopkeeperId || actor.role !== "OWNER") return { success: false as const, error: "Only the business owner can change the Till installation logo." }
  const owned = await db.posBusiness.findUnique({ where: { id: actor.businessId }, select: { ownerUserId: true } })
  if (!actor.userId || owned?.ownerUserId !== actor.userId) return { success: false as const, error: "Only the business owner can change the Till installation logo." }
  if (input !== null && !validInstallLogo(input)) return { success: false as const, error: "Select a valid logo and prepare its square preview before saving." }
  let logo: string | null = null
  if (typeof input === "string") {
    try { logo = `data:image/png;base64,${Buffer.from(await renderInstallLogo(input, 512).arrayBuffer()).toString("base64")}` }
    catch { return { success: false as const, error: "This image could not be read. Choose another logo." } }
    if (!validInstallLogo(logo)) return { success: false as const, error: "The prepared logo is too large. Choose a simpler image." }
  }
  const shop = await db.shopkeeperProfile.findUnique({ where: { id: actor.shopkeeperId }, select: { posConfig: true } })
  if (!shop) return { success: false as const, error: "The shop could not be found." }
  await db.shopkeeperProfile.update({ where: { id: actor.shopkeeperId }, data: { posConfig: { ...(shop.posConfig as object ?? {}), installLogo: logo } } })
  const address = await getTillAddress()
  if (address) (await cookies()).set("saji-till-shop", address.slug, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 31_536_000 })
  await recordPosAudit({ actor, action: "settings.install_logo", summary: logo ? "Updated the business Till installation logo" : "Removed the business Till installation logo" })
  revalidatePath("/pos", "layout")
  return { success: true as const, logo, slug: address?.slug ?? null }
}
