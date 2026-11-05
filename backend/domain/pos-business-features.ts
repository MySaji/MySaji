import { effectiveTraits, resolvePosProfile } from "./pos-profiles"

export function posBusinessFeatures(shop: { posProfileKey?: string | null; posTraits?: readonly string[] | null; posConfig?: unknown }) {
  const profile = resolvePosProfile(shop.posProfileKey)
  const traits = effectiveTraits(profile.key, shop.posTraits)
  const config = shop.posConfig && typeof shop.posConfig === "object" ? shop.posConfig as Record<string, unknown> : {}
  return {
    profileKey: profile.key,
    traits,
    tableService: typeof config.tableService === "boolean" ? config.tableService : ["RESTAURANT", "CAFE", "BAR", "HOTEL"].includes(profile.key),
    jobCards: traits.includes("JOB_CARD"),
    deposits: traits.includes("MADE_TO_ORDER"),
    salon: profile.key === "SALON" && traits.includes("SERVICE"),
    services: traits.includes("SERVICE"),
    variants: traits.includes("VARIANTS"),
    batches: traits.includes("BATCH_EXPIRY"),
    serials: traits.includes("SERIALISED"),
  }
}

export type PosBusinessFeatures = ReturnType<typeof posBusinessFeatures>

export function businessSupportsPage(href: string, features?: PosBusinessFeatures | null): boolean {
  switch (href.split("/")[2]) {
    case "floor": case "kitchen": return features?.tableService === true
    case "jobs": return features?.jobCards === true
    case "orders": return features?.deposits === true
    case "salon": return features?.salon === true
    default: return true
  }
}
