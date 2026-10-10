/**
 * Shop profiles: each of the thirty-five shop types as a named bundle of
 * traits, a default selling unit and a starting till layout.
 *
 * Plain module, no server imports — see lib/pos-traits.ts for why.
 *
 * A profile is a PRESET, not a permission and not a schema. Picking
 * "Butchery" at signup switches on MEASURED and WASTAGE and defaults the
 * unit to kg; it does not lock anything. The shopkeeper can change every one
 * of those afterwards from POS settings, and a shop that does not recognise
 * itself in any row picks GENERAL and configures by hand. This matters
 * commercially: the list below will never be complete, and a POS that only
 * works for the shops its authors anticipated is not a product.
 *
 * Read the TRAIT COLUMNS of this table, not the rows. VARIANTS appears far
 * more often than anything else, then MEASURED; SERIALISED and CONTROLLED
 * are narrow. That is the build order, and it is invisible from a list of
 * verticals. traitFrequency() below computes it rather than asserting it.
 */

import { type PosTrait, type PosUnit, normaliseTraits } from "./pos-traits"

/** Broad grouping, used only to organise the shop-type picker. */
export type PosProfileGroup =
  | "food"
  | "clothing"
  | "electronics"
  | "home"
  | "trade"
  | "health"
  | "general"

export const POS_PROFILE_GROUP_LABEL: Record<PosProfileGroup, string> = {
  food: "Food & fresh produce",
  clothing: "Clothing & personal",
  electronics: "Electronics & devices",
  home: "Home & household",
  trade: "Trade, building & motor",
  health: "Health & agriculture",
  general: "General retail",
}

export type PosProfile = {
  key: string
  label: string
  /** One line for the person choosing, not for the database. */
  description: string
  group: PosProfileGroup
  /** The preset. Every one of them switchable afterwards. */
  traits: PosTrait[]
  /** What "one" means here by default. */
  defaultUnit: PosUnit
  /** lucide-react icon name. */
  icon: string
}

/**
 * The table. Derived from the trait matrix in POS1.md section 3 — if you
 * change a row here, change it there too, or the design document stops
 * describing the code.
 */
export const POS_PROFILES: PosProfile[] = [
  // --- Food & fresh produce ---
  { key: "GROCERY", label: "Grocery shop", description: "Everyday food and household basics", group: "food",
    traits: ["MEASURED", "BATCH_EXPIRY", "BULK_BREAK", "WASTAGE"], defaultUnit: "piece", icon: "ShoppingBasket" },
  { key: "SUPERMARKET", label: "Supermarket", description: "Wide range, barcodes, several tills", group: "food",
    traits: ["MEASURED", "VARIANTS", "BATCH_EXPIRY", "AGE_RESTRICTED", "WASTAGE"], defaultUnit: "piece", icon: "ShoppingCart" },
  { key: "CEREALS", label: "Cereals & grains", description: "Maize, beans and rice sold by weight", group: "food",
    traits: ["MEASURED", "BULK_BREAK", "WASTAGE"], defaultUnit: "kg", icon: "Wheat" },
  { key: "PRODUCE", label: "Fruits & vegetables", description: "Fresh produce, priced by weight and prone to loss", group: "food",
    traits: ["MEASURED", "BATCH_EXPIRY", "WASTAGE"], defaultUnit: "kg", icon: "Apple" },
  { key: "BUTCHERY", label: "Butchery", description: "Meat cut and weighed at the counter", group: "food",
    traits: ["MEASURED", "BATCH_EXPIRY", "WASTAGE"], defaultUnit: "kg", icon: "Beef" },
  { key: "BAKERY", label: "Bakery", description: "Baked daily, sold the same day", group: "food",
    traits: ["MEASURED", "BATCH_EXPIRY", "WASTAGE"], defaultUnit: "piece", icon: "Croissant" },
  { key: "LIQUOR", label: "Liquor store", description: "Wines, spirits and beer, age checked at the till", group: "food",
    traits: ["MEASURED", "VARIANTS", "BATCH_EXPIRY", "AGE_RESTRICTED"], defaultUnit: "piece", icon: "Wine" },

  // --- Clothing & personal ---
  { key: "CLOTHES", label: "Clothes & fashion", description: "Garments in sizes and colours", group: "clothing",
    traits: ["VARIANTS"], defaultUnit: "piece", icon: "Shirt" },
  { key: "SHOES", label: "Shoe shop", description: "Footwear by size", group: "clothing",
    traits: ["VARIANTS"], defaultUnit: "pair", icon: "Footprints" },
  { key: "MITUMBA", label: "Mitumba / second-hand", description: "Bought as bales, sold as pieces at agreed prices", group: "clothing",
    traits: ["VARIANTS", "BULK_BREAK", "OPEN_PRICE"], defaultUnit: "piece", icon: "Recycle" },
  { key: "COSMETICS", label: "Cosmetics & beauty", description: "Skincare and make-up with expiry dates", group: "clothing",
    traits: ["VARIANTS", "BATCH_EXPIRY"], defaultUnit: "piece", icon: "Sparkles" },
  { key: "PERFUME", label: "Perfume", description: "Fragrances by size and batch", group: "clothing",
    traits: ["VARIANTS", "BATCH_EXPIRY"], defaultUnit: "piece", icon: "SprayCan" },
  { key: "JEWELLERY", label: "Jewellery & watches", description: "High-value pieces tracked individually", group: "clothing",
    traits: ["VARIANTS", "SERIALISED"], defaultUnit: "piece", icon: "Gem" },
  { key: "BABY", label: "Baby products", description: "Formula, nappies and clothing by age and batch", group: "clothing",
    traits: ["VARIANTS", "BATCH_EXPIRY"], defaultUnit: "piece", icon: "Baby" },

  // --- Electronics & devices ---
  { key: "PHONES", label: "Phones & accessories", description: "Handsets by IMEI, accessories by model fit", group: "electronics",
    traits: ["VARIANTS", "SERIALISED", "FITMENT"], defaultUnit: "piece", icon: "Smartphone" },
  { key: "ELECTRONICS", label: "Electronics", description: "TVs and appliances with serials and warranties", group: "electronics",
    traits: ["VARIANTS", "SERIALISED", "FITMENT"], defaultUnit: "piece", icon: "Tv" },

  // --- Home & household ---
  { key: "KITCHENWARE", label: "Kitchenware", description: "Utensils and cookware by size and set", group: "home",
    traits: ["VARIANTS"], defaultUnit: "piece", icon: "CookingPot" },
  { key: "BEDDING", label: "Bedding & curtains", description: "Sold by the metre and made to order", group: "home",
    traits: ["MEASURED", "VARIANTS", "MADE_TO_ORDER"], defaultUnit: "m", icon: "BedDouble" },
  { key: "FURNITURE", label: "Furniture", description: "Deposit taken, delivered or built later", group: "home",
    traits: ["VARIANTS", "MADE_TO_ORDER"], defaultUnit: "piece", icon: "Armchair" },
  { key: "PLASTICS", label: "Plastic household goods", description: "Basins, buckets and crates bought in bulk", group: "home",
    traits: ["VARIANTS", "BULK_BREAK"], defaultUnit: "piece", icon: "Box" },
  { key: "DETERGENTS", label: "Detergents & cleaning", description: "Decanted from drums or sold packaged", group: "home",
    traits: ["MEASURED", "VARIANTS", "BATCH_EXPIRY", "BULK_BREAK"], defaultUnit: "l", icon: "Droplets" },

  // --- Trade, building & motor ---
  { key: "HARDWARE", label: "Hardware", description: "Tools and fasteners, cut and counted", group: "trade",
    traits: ["MEASURED", "FITMENT", "BULK_BREAK"], defaultUnit: "piece", icon: "Wrench" },
  { key: "PLUMBING", label: "Hardware & plumbing", description: "Pipe by the metre, fittings by size", group: "trade",
    traits: ["MEASURED", "FITMENT", "BULK_BREAK"], defaultUnit: "m", icon: "Pipette" },
  { key: "ELECTRICAL", label: "Electrical supplies", description: "Cable by the metre, fittings by rating", group: "trade",
    traits: ["MEASURED", "FITMENT", "BULK_BREAK"], defaultUnit: "m", icon: "Zap" },
  { key: "BUILDING", label: "Building materials", description: "Cement, sand and steel, quoted and delivered", group: "trade",
    traits: ["MEASURED", "FITMENT", "MADE_TO_ORDER", "BULK_BREAK"], defaultUnit: "bag", icon: "Blocks" },
  { key: "SPARES", label: "Car spare parts", description: "Parts looked up by vehicle, tracked by part number", group: "trade",
    traits: ["SERIALISED", "FITMENT"], defaultUnit: "piece", icon: "Car" },

  // --- Health & agriculture ---
  { key: "PHARMACY", label: "Pharmacy", description: "Dispensing with batches, expiry and a controlled register", group: "health",
    traits: ["BATCH_EXPIRY", "AGE_RESTRICTED", "CONTROLLED", "WASTAGE"], defaultUnit: "piece", icon: "Pill" },
  { key: "AGROVET", label: "Agrovet", description: "Feed by weight, drugs by batch and register", group: "health",
    traits: ["MEASURED", "BATCH_EXPIRY", "CONTROLLED", "BULK_BREAK", "WASTAGE"], defaultUnit: "kg", icon: "Sprout" },
  { key: "PET", label: "Pet supplies", description: "Feed by weight, accessories by size", group: "health",
    traits: ["MEASURED", "VARIANTS", "BATCH_EXPIRY", "BULK_BREAK"], defaultUnit: "kg", icon: "PawPrint" },

  // --- General retail ---
  { key: "GENERAL", label: "General merchandise", description: "A bit of everything, and the most configurable starting point", group: "general",
    traits: ["MEASURED", "VARIANTS", "BULK_BREAK", "OPEN_PRICE"], defaultUnit: "piece", icon: "Store" },
  { key: "STATIONERY", label: "Stationery & school supplies", description: "Books and pens, often by the dozen", group: "general",
    traits: ["VARIANTS", "BULK_BREAK"], defaultUnit: "piece", icon: "PenLine" },
  { key: "BOOKSHOP", label: "Bookshop", description: "Titles and editions", group: "general",
    traits: ["VARIANTS"], defaultUnit: "piece", icon: "BookOpen" },
  { key: "GIFTS", label: "Gifts & toys", description: "Prices often agreed at the counter", group: "general",
    traits: ["VARIANTS", "OPEN_PRICE"], defaultUnit: "piece", icon: "Gift" },
  { key: "SPORTS", label: "Sports equipment", description: "Kit and gear by size", group: "general",
    traits: ["VARIANTS"], defaultUnit: "piece", icon: "Dumbbell" },
  { key: "WHOLESALE_COSMETICS", label: "Cosmetics wholesale", description: "Sold by carton to retailers, broken down on request", group: "general",
    traits: ["VARIANTS", "BATCH_EXPIRY", "BULK_BREAK"], defaultUnit: "crate", icon: "Boxes" },
]

export const POS_PROFILE_BY_KEY: Record<string, PosProfile> = Object.fromEntries(
  POS_PROFILES.map((p) => [p.key, p]),
)

/**
 * The fallback for a shop that picked nothing, and for every shop that
 * existed before POS did. Deliberately the most permissive profile rather
 * than the most restrictive: an unconfigured till that refuses a fractional
 * quantity is a support ticket, one that allows it is merely untidy.
 */
export const DEFAULT_POS_PROFILE_KEY = "GENERAL"

export function isPosProfileKey(value: string): boolean {
  return value in POS_PROFILE_BY_KEY
}

export function resolvePosProfile(key: string | null | undefined): PosProfile {
  return (key ? POS_PROFILE_BY_KEY[key] : undefined) ?? POS_PROFILE_BY_KEY[DEFAULT_POS_PROFILE_KEY]
}

/** Profiles grouped for the picker, in POS_PROFILE_GROUP_LABEL order. */
export function posProfilesByGroup(): { group: PosProfileGroup; label: string; profiles: PosProfile[] }[] {
  const groups = Object.keys(POS_PROFILE_GROUP_LABEL) as PosProfileGroup[]
  return groups.map((group) => ({
    group,
    label: POS_PROFILE_GROUP_LABEL[group],
    profiles: POS_PROFILES.filter((p) => p.group === group),
  }))
}

/**
 * The traits a shop ends up with: its profile's preset, overridden by any
 * explicit choice it has saved.
 *
 * `saved` being an empty array is NOT the same as it being null. A shop that
 * has deliberately switched every trait off must keep them off, so only null
 * or undefined falls back to the preset.
 */
export function effectiveTraits(
  profileKey: string | null | undefined,
  saved: readonly string[] | null | undefined,
): PosTrait[] {
  if (saved) return normaliseTraits(saved)
  return resolvePosProfile(profileKey).traits
}

/** How often each trait appears across every profile. Drives build order. */
export function traitFrequency(): Record<PosTrait, number> {
  const counts = {} as Record<PosTrait, number>
  for (const p of POS_PROFILES) for (const t of p.traits) counts[t] = (counts[t] ?? 0) + 1
  return counts
}
