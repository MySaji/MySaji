"use server"

import { z } from "zod"
import { db } from "@/backend/db"
import { requireAdmin } from "@/backend/actions/admin-dashboard"
import { logAdminAction } from "@/backend/services/admin-audit-core"
import { loadMapConfig } from "@/backend/services/map-settings"

export async function getAdminMapSettings() {
  if (!await requireAdmin()) return { success: false as const, error: "Administrator access is required." }
  try { return { success: true as const, data: await loadMapConfig() } }
  catch { return { success: false as const, error: "Map settings could not be loaded. Please retry." } }
}
export async function updateAdminMapSettings(input: unknown) {
  const admin = await requireAdmin()
  if (!admin) return { success: false as const, error: "Administrator access is required." }
  const parsed = z.object({ provider: z.enum(["GOOGLE", "OPENSTREETMAP"]) }).safeParse(input)
  if (!parsed.success) return { success: false as const, error: "Choose Google Maps or OpenStreetMap." }
  if (parsed.data.provider === "GOOGLE" && !process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) return { success: false as const, error: "Configure the Google Maps browser key before selecting Google Maps." }
  try {
    const existing = await db.platformSetting.findUnique({ where: { key: "maps" } })
    await db.platformSetting.upsert({ where: { key: "maps" }, create: { key: "maps", value: parsed.data, updatedById: admin.userId }, update: { value: parsed.data, updatedById: admin.userId } })
    await logAdminAction({ userId: admin.userId, action: "map_provider.update", entityType: "PlatformSetting", entityId: "maps", oldValues: existing?.value as Record<string, unknown> | undefined, newValues: parsed.data })
    return { success: true as const, data: await loadMapConfig() }
  } catch { return { success: false as const, error: "Map settings could not be saved. Reload settings to check the current selection before retrying." } }
}
