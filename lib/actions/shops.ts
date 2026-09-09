"use server"

import { db } from "@/lib/db"
import { isShopCurrentlyOpen, formatShopHours, getNextOpeningLabel, resolveShopHoursForToday } from "@/lib/format"


/** Today's applicable pair as a tuple, so the three call sites below read the
 *  same hours the customer is shown. */
function todayPair(shop: Parameters<typeof resolveShopHoursForToday>[0]): [string | null, string | null] {
  const { openingTime, closingTime } = resolveShopHoursForToday(shop)
  return [openingTime, closingTime]
}

export type ShopDetail = {
  id: string
  name: string
  description: string | null
  category: string | null
  logoUrl: string | null
  rating: number
  reviewCount: number
  isVerified: boolean
  isOpen: boolean
  hoursLabel: string | null
  nextOpeningLabel: string | null
  hasSale: boolean
  location: string | null
  latitude: number | null
  longitude: number | null
  isOnVacation: boolean
  vacationNote: string | null
} | null

export async function getShopById(id: string): Promise<ShopDetail> {
  const shop = await db.shopkeeperProfile.findUnique({
    where: { id },
    include: { promotions: { where: { status: "ACTIVE" }, take: 1 } },
  })
  if (!shop) return null

  // Shop location reuses the owner's real Address row (type OFFICE, written
  // at onboarding) — this was previously captured and then never read back
  // anywhere customer-facing.
  const shopAddress = await db.address.findFirst({
    where: { userId: shop.userId, type: "OFFICE" },
    orderBy: { isDefault: "desc" },
  })

  return {
    id: shop.id,
    name: shop.shopName,
    description: shop.shopDescription,
    category: shop.shopCategory,
    logoUrl: shop.shopLogoUrl,
    rating: Number(shop.rating),
    reviewCount: shop.reviewCount,
    isVerified: shop.isVerified,
    isOpen: isShopCurrentlyOpen(...todayPair(shop)),
    hoursLabel: formatShopHours(...todayPair(shop)),
    nextOpeningLabel: getNextOpeningLabel(shop),
    hasSale: shop.promotions.length > 0,
    location: shopAddress ? [shopAddress.address, shopAddress.city].filter(Boolean).join(", ") : null,
    latitude: shopAddress?.latitude != null ? Number(shopAddress.latitude) : null,
    longitude: shopAddress?.longitude != null ? Number(shopAddress.longitude) : null,
    isOnVacation: shop.isOnVacation,
    vacationNote: shop.vacationNote,
  }
}
