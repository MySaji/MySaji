/**
 * What a line actually costs, once the customer and the offers are known.
 *
 * Pure. No database, no session, no Prisma. The caller loads the price list
 * and the promotions and hands them in, which means every rule here can be
 * argued with in a test instead of only in production.
 *
 * THE ORDER, AND WHY IT IS THIS ORDER
 *
 *   1. the shelf price, or the variant's
 *   2. the customer's price list, if they are on one
 *   3. promotions, lowest priority number first
 *   4. the cashier's own override, if they typed one
 *
 * A price list comes before promotions because it is what this customer has
 * agreed to pay, and an offer is something the shop is doing on top. Running
 * them the other way round means a wholesaler's negotiated price gets a
 * retail promotion applied to it and the shop sells below cost without
 * anybody deciding to.
 *
 * A cashier's override comes last and beats everything, because the person at
 * the counter is looking at the customer and the system is not. It is
 * recorded as an override so a shopkeeper reviewing a strange day can find
 * it.
 */

export type PriceListEntry = {
  productId: string
  /** Absolute price, not a discount. */
  price: number
  /** The break this price applies from. 1 means always. */
  minQuantity: number
}

export type PromotionKind = "PERCENT_OFF" | "AMOUNT_OFF" | "BUY_X_GET_Y" | "BUNDLE_PRICE"

export type Promotion = {
  id: string
  name: string
  kind: PromotionKind
  productId: string | null
  categoryId: string | null
  percentOff: number | null
  amountOff: number | null
  buyQuantity: number | null
  getQuantity: number | null
  getPercentOff: number | null
  bundleQuantity: number | null
  bundlePrice: number | null
  priority: number
  stackable: boolean
}

export type PricedFor = {
  productId: string
  categoryId: string | null
  quantity: number
  /** The shelf price, or the variant's where it has its own. */
  basePrice: number
  /** What the cashier typed, where they typed one. */
  override?: number | null
}

export type PriceBreakdown = {
  /** Where it started. */
  basePrice: number
  /** Per unit, after the price list but before any offer. */
  listPrice: number
  /** What the line comes to in the end. */
  lineTotal: number
  /** basePrice * quantity less lineTotal. Never negative. */
  savedAmount: number
  /** Named, so the receipt can say why and the customer believes it. */
  appliedPromotions: { id: string; name: string; saved: number }[]
  /** True when the cashier's own price was used. */
  overridden: boolean
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/**
 * The price list entry that applies at this quantity.
 *
 * The highest break at or below what they are buying: a ladder of 1, 12 and
 * 100 means twelve units take the 12 price, not the 1 price and not the 100.
 */
export function priceListPriceFor(
  entries: PriceListEntry[],
  productId: string,
  quantity: number,
): number | null {
  const candidates = entries
    .filter((e) => e.productId === productId && e.minQuantity <= quantity)
    .sort((a, b) => b.minQuantity - a.minQuantity)
  return candidates.length > 0 ? candidates[0].price : null
}

/** Does this offer apply to this line at all? */
export function promotionApplies(promo: Promotion, line: PricedFor): boolean {
  if (promo.productId) return promo.productId === line.productId
  if (promo.categoryId) return promo.categoryId === line.categoryId
  // Neither set means the whole shop.
  return true
}

/**
 * Work out one line.
 *
 * Quantities are treated as whole units for BUY_X_GET_Y and BUNDLE_PRICE,
 * because "buy two get one" on 2.4 kg of sugar is not a thing anybody means.
 * Percentage and amount offers apply to fractional quantities perfectly well
 * and are left alone.
 */
export function priceLine(
  line: PricedFor,
  priceList: PriceListEntry[],
  promotions: Promotion[],
): PriceBreakdown {
  const qty = line.quantity
  const base = line.basePrice

  // ---- 2. the customer's own price ---------------------------------------
  const listed = priceListPriceFor(priceList, line.productId, qty)
  const unit = listed ?? base

  // ---- 4. the cashier wins, and nothing else runs ------------------------
  //
  // Checked before the offers rather than after: applying a promotion to a
  // price somebody typed would quietly undercut the figure they just agreed
  // with the customer at the counter.
  if (line.override != null) {
    const total = round2(line.override * qty)
    return {
      basePrice: base,
      listPrice: unit,
      lineTotal: total,
      savedAmount: Math.max(0, round2(base * qty - total)),
      appliedPromotions: [],
      overridden: true,
    }
  }

  // ---- 3. the offers ------------------------------------------------------
  const applicable = promotions
    .filter((p) => promotionApplies(p, line))
    .sort((a, b) => a.priority - b.priority)

  let total = round2(unit * qty)
  const applied: { id: string; name: string; saved: number }[] = []
  let touched = false

  for (const promo of applicable) {
    // Not stackable, and something has already changed this line: skip. The
    // default is deliberately strict, because stacked offers are how a shop
    // sells below cost without anybody deciding to.
    if (touched && !promo.stackable) continue

    const before = total
    const effectiveUnit = qty > 0 ? total / qty : 0

    switch (promo.kind) {
      case "PERCENT_OFF": {
        if (promo.percentOff == null) break
        total = round2(total * (1 - promo.percentOff / 100))
        break
      }
      case "AMOUNT_OFF": {
        if (promo.amountOff == null) break
        // Floored at zero: an offer bigger than the price makes the line
        // free, never negative. A negative line would pay the customer.
        total = round2(Math.max(0, total - promo.amountOff * qty))
        break
      }
      case "BUY_X_GET_Y": {
        const buy = promo.buyQuantity ?? 0
        const get = promo.getQuantity ?? 0
        const off = promo.getPercentOff ?? 100
        if (buy <= 0 || get <= 0) break
        const whole = Math.floor(qty)
        const groups = Math.floor(whole / (buy + get))
        if (groups <= 0) break
        const discountedUnits = groups * get
        total = round2(total - discountedUnits * effectiveUnit * (off / 100))
        break
      }
      case "BUNDLE_PRICE": {
        const n = promo.bundleQuantity ?? 0
        const price = promo.bundlePrice
        if (n <= 0 || price == null) break
        const whole = Math.floor(qty)
        const bundles = Math.floor(whole / n)
        if (bundles <= 0) break
        const remainder = qty - bundles * n
        total = round2(bundles * price + remainder * effectiveUnit)
        break
      }
    }

    const saved = round2(before - total)
    if (saved > 0) {
      applied.push({ id: promo.id, name: promo.name, saved })
      touched = true
    }
  }

  return {
    basePrice: base,
    listPrice: unit,
    lineTotal: total,
    savedAmount: Math.max(0, round2(base * qty - total)),
    appliedPromotions: applied,
    overridden: false,
  }
}

/** Is this offer live right now? */
export function promotionIsLive(
  promo: { isActive: boolean; startsAt: Date | null; endsAt: Date | null },
  now: Date = new Date(),
): boolean {
  if (!promo.isActive) return false
  if (promo.startsAt && now < promo.startsAt) return false
  // Inclusive of the end moment: an offer that says it ends at midnight
  // should still work at midnight, which is when the queue is longest.
  if (promo.endsAt && now > promo.endsAt) return false
  return true
}
