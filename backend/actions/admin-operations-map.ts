"use server"

import { z } from "zod"
import { db } from "@/backend/db"
import { requireAdmin } from "@/backend/actions/admin-dashboard"
import { mapCoordinates, type OperationsLocation } from "@/backend/domain/admin-operations-map"

const cursorSchema = z.object({ shops: z.string().max(200).nullable(), providers: z.string().max(200).nullable(), distributors: z.string().max(200).nullable() })
const PAGE_SIZE = 250
export type OperationsMapCursor = z.infer<typeof cursorSchema>
export type OperationsMapPage = {
  locations: OperationsLocation[]
  totals: { shops: number; pos: number; providers: number; distributors: number }
  next: OperationsMapCursor | null
  fetchedAt: string
}

export async function getAdminOperationsMap(cursor?: OperationsMapCursor): Promise<OperationsMapPage | null> {
  if (!await requireAdmin()) return null
  const parsed = cursor === undefined ? null : cursorSchema.safeParse(cursor)
  if (parsed && !parsed.success) return null
  const after = parsed?.success ? parsed.data : undefined
  const owner = { deletedAt: null }
  const shopsWhere = { user: owner }
  const providersWhere = { user: owner, parentBusinessId: null }
  const distributorsWhere = { distributor: { user: owner } }
  const ownerSelect = { id: true, name: true, isActive: true } as const
  const page = (id: string | null | undefined) => ({ take: PAGE_SIZE + 1, orderBy: { id: "asc" as const }, ...(id ? { cursor: { id }, skip: 1 } : {}) })
  const [shops, providers, distributors, shopCount, posCount, providerCount, distributorCount] = await Promise.all([
    after?.shops === null ? [] : db.shopkeeperProfile.findMany({ where: shopsWhere, ...page(after?.shops), select: { id: true, shopName: true, shopCategory: true, posEnabled: true, posProfileKey: true, latitude: true, longitude: true, isVerified: true, updatedAt: true, user: { select: ownerSelect }, posStore: { select: { name: true, town: true, county: true, isActive: true, business: { select: { name: true } } } } } }),
    after?.providers === null ? [] : db.providerProfile.findMany({ where: providersWhere, ...page(after?.providers), select: { id: true, businessName: true, workAreas: true, latitude: true, longitude: true, verified: true, workPreference: true, updatedAt: true, category: { select: { name: true } }, user: { select: ownerSelect } } }),
    after?.distributors === null ? [] : db.distributorLocation.findMany({ where: distributorsWhere, ...page(after?.distributors), select: { id: true, name: true, city: true, type: true, latitude: true, longitude: true, isActive: true, updatedAt: true, distributor: { select: { user: { select: ownerSelect } } } } }),
    db.shopkeeperProfile.count({ where: shopsWhere }),
    db.shopkeeperProfile.count({ where: { ...shopsWhere, posEnabled: true } }),
    db.providerProfile.count({ where: providersWhere }),
    db.distributorLocation.count({ where: distributorsWhere }),
  ])
  const locations: OperationsLocation[] = [
    ...shops.slice(0, PAGE_SIZE).map(shop => ({ id: `shop:${shop.id}`, recordId: shop.id, userId: shop.user.id, kind: shop.posEnabled ? "pos" as const : "shop" as const, name: shop.posStore ? `${shop.posStore.business.name} - ${shop.posStore.name}` : shop.shopName, directoryQuery: shop.posStore?.business.name || shop.shopName, ownerName: shop.user.name, area: shop.posStore ? [shop.posStore.town, shop.posStore.county].filter(Boolean).join(", ") || null : null, ...mapCoordinates(shop.latitude, shop.longitude), approximate: false, active: shop.user.isActive && (shop.posStore?.isActive ?? true), verified: shop.isVerified, detail: shop.posProfileKey || shop.shopCategory, updatedAt: shop.updatedAt.toISOString() })),
    ...providers.slice(0, PAGE_SIZE).map(provider => ({ id: `provider:${provider.id}`, recordId: provider.id, userId: provider.user.id, kind: "provider" as const, name: provider.businessName || provider.user.name, ownerName: provider.user.name, area: provider.workAreas.slice(0, 3).join(", ") || null, ...mapCoordinates(provider.workPreference === "REMOTE" ? null : provider.latitude, provider.workPreference === "REMOTE" ? null : provider.longitude, true), approximate: true, active: provider.user.isActive, verified: provider.verified, detail: provider.workPreference === "REMOTE" ? "Remote provider" : provider.category?.name ?? null, updatedAt: provider.updatedAt.toISOString() })),
    ...distributors.slice(0, PAGE_SIZE).map(branch => ({ id: `distributor:${branch.id}`, recordId: branch.id, userId: branch.distributor.user.id, kind: "distributor" as const, name: branch.name, ownerName: branch.distributor.user.name, area: branch.city, ...mapCoordinates(branch.latitude, branch.longitude), approximate: false, active: branch.isActive && branch.distributor.user.isActive, verified: false, detail: branch.type.replaceAll("_", " "), updatedAt: branch.updatedAt.toISOString() })),
  ]
  const next = { shops: shops.length > PAGE_SIZE ? shops[PAGE_SIZE - 1].id : null, providers: providers.length > PAGE_SIZE ? providers[PAGE_SIZE - 1].id : null, distributors: distributors.length > PAGE_SIZE ? distributors[PAGE_SIZE - 1].id : null }
  return { locations, totals: { shops: shopCount, pos: posCount, providers: providerCount, distributors: distributorCount }, next: Object.values(next).some(Boolean) ? next : null, fetchedAt: new Date().toISOString() }
}
