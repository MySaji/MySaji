/**
 * The POS trait engine: what a till has to do differently, and for whom.
 *
 * Plain module, no server imports — the signup picker, the shop-type
 * sub-picker, the till itself and the admin matrix all read this table, and
 * a client component must be able to import it without dragging Prisma into
 * the browser bundle. Same reason lib/pro-modules.ts exists.
 *
 * ---------------------------------------------------------------------------
 * WHY TRAITS AND NOT THIRTY-FIVE PRODUCTS
 * ---------------------------------------------------------------------------
 * A butchery and a phone shop look like two different applications until you
 * ask what actually differs. The cart, the receipt, the stock count, the
 * day's total, the cashier shift — identical. What differs is the *shape of
 * a sale line and a stock record*:
 *
 *   - the butchery sells 1.35 of something
 *   - the phone shop sells one specific IMEI
 *
 * That is two traits, not two products. Thirty-five shop types collapse into
 * eleven composable behaviours, and every shop type below is a named bundle
 * of them. A shopkeeper can switch any trait on or off afterwards: the bundle
 * is a starting point, never a cage.
 *
 * The discipline this imposes is worth stating: a trait earns its place ONLY
 * if it changes the shape of a sale or a stock record. "Brands" is a product
 * attribute. "Low-stock alerts" is core. "Barcode scanning" is an input
 * method any shop may enable. None of those are traits. Keep this list
 * short and the core fat.
 */

export const POS_TRAITS = [
  "MEASURED",
  "VARIANTS",
  "SERIALISED",
  "BATCH_EXPIRY",
  "AGE_RESTRICTED",
  "CONTROLLED",
  "FITMENT",
  "MADE_TO_ORDER",
  "BULK_BREAK",
  "WASTAGE",
  "OPEN_PRICE",
] as const

export type PosTrait = (typeof POS_TRAITS)[number]

export type PosTraitMeta = {
  /** Shown on the trait toggle, written for a shopkeeper. */
  label: string
  /** The question this trait answers at the counter. */
  question: string
  /** What switching it on actually changes, in one line. */
  effect: string
  /** lucide-react icon name; resolved by the component that renders it. */
  icon: string
  /**
   * Implementation stage. The picker and the settings page must not promise
   * a shopkeeper a behaviour that is not wired up yet — a till that silently
   * ignores AGE_RESTRICTED is worse than one that says "not yet".
   */
  stage: "live" | "planned"
}

export const POS_TRAIT_META: Record<PosTrait, PosTraitMeta> = {
  MEASURED: {
    label: "Sell by weight or measure",
    question: 'How much is "one"?',
    effect: "Quantities can be fractional (1.35 kg) and the till shows a keypad instead of a stepper",
    icon: "Scale",
    stage: "live",
  },
  VARIANTS: {
    label: "Sizes and colours",
    question: "Same product, different size or colour?",
    effect: "One product holds many sellable units, each with its own stock and barcode",
    icon: "Shapes",
    stage: "live",
  },
  SERIALISED: {
    label: "Track each item individually",
    question: "Which physical unit was sold?",
    effect: "Every unit carries an IMEI or serial, captured at the point of sale",
    icon: "Fingerprint",
    stage: "planned",
  },
  BATCH_EXPIRY: {
    label: "Batches and expiry dates",
    question: "Which batch, and when does it expire?",
    effect: "Stock is held per delivery, sold soonest-to-expire first, and warns before expiry",
    icon: "CalendarClock",
    stage: "live",
  },
  AGE_RESTRICTED: {
    label: "Age-restricted goods",
    question: "May this person legally buy it?",
    effect: "The till asks the cashier to confirm age, and records that they did",
    icon: "ShieldAlert",
    stage: "live",
  },
  CONTROLLED: {
    label: "Controlled substances register",
    question: "Must this sale be recorded to a register?",
    effect: "Captures buyer and prescriber details and writes an immutable register entry",
    icon: "FileLock",
    stage: "planned",
  },
  FITMENT: {
    label: "Compatibility lookup",
    question: "Does this part fit that machine?",
    effect: "Products carry what they fit, and the till can search by vehicle or model",
    icon: "Puzzle",
    stage: "planned",
  },
  MADE_TO_ORDER: {
    label: "Deposits and later delivery",
    question: "Deposit now, deliver later?",
    effect: "A sale can be part-paid and stay open until the goods are handed over",
    icon: "Hammer",
    stage: "planned",
  },
  BULK_BREAK: {
    label: "Buy in bulk, sell in pieces",
    question: "Bought as a bale, sold as pieces?",
    effect: "Stock arrives in one unit and is sold in another, with the conversion recorded",
    icon: "PackageOpen",
    stage: "planned",
  },
  WASTAGE: {
    label: "Record spoilage and loss",
    question: "What did we lose, rather than sell?",
    effect: "Stock can leave for a reason other than a sale, and the loss is reportable",
    icon: "Trash2",
    stage: "live",
  },
  OPEN_PRICE: {
    label: "Cashier sets the price",
    question: "Is the price agreed at the counter?",
    effect: "A line can be rung up with a price typed in rather than a fixed one",
    icon: "Pencil",
    stage: "live",
  },
}

/** Units a MEASURED shop can sell in. `piece` is the default for everyone. */
export const POS_UNITS = ["piece", "kg", "g", "l", "ml", "m", "m2", "pair", "dozen", "bale", "crate", "bag"] as const
export type PosUnit = (typeof POS_UNITS)[number]

export const POS_UNIT_LABEL: Record<PosUnit, string> = {
  piece: "piece", kg: "kg", g: "g", l: "litre", ml: "ml",
  m: "metre", m2: "m²", pair: "pair", dozen: "dozen",
  bale: "bale", crate: "crate", bag: "bag",
}

export function isPosTrait(value: string): value is PosTrait {
  return (POS_TRAITS as readonly string[]).includes(value)
}

export function isPosUnit(value: string): value is PosUnit {
  return (POS_UNITS as readonly string[]).includes(value)
}

/** Keeps only recognised traits, de-duplicated, in POS_TRAITS order. */
export function normaliseTraits(values: readonly string[]): PosTrait[] {
  const set = new Set(values.filter(isPosTrait))
  return POS_TRAITS.filter((t) => set.has(t))
}

/** Traits the till actually implements today. */
export const LIVE_POS_TRAITS: PosTrait[] = POS_TRAITS.filter((t) => POS_TRAIT_META[t].stage === "live")
