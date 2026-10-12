import { Prisma } from "@prisma/client"
import type { StockMovementKind } from "@prisma/client"

/**
 * What the stock on the shelf actually cost.
 *
 * THE PROBLEM THIS SOLVES
 *
 * A shop buys sugar at 150, sells some, then buys more at 170 because the
 * price moved. What does the sugar on the shelf cost now? Until this
 * existed, `Product.costPrice` was whatever somebody last typed into a form,
 * so every margin, every stock valuation and every costed wastage figure was
 * quoting a number that might be a year old and was certainly not the cost
 * of the mixed stock actually sitting there.
 *
 * WHY WEIGHTED AVERAGE AND NOT FIFO
 *
 * FIFO is more precise and needs a cost layer per receipt, consumed in
 * order, reopened on a return, and reconciled whenever a stock count
 * disagrees. That machinery belongs in a product whose users ask for it.
 * What a duka needs is one honest number per product, and the weighted
 * average is the one every Kenyan accountant will recognise:
 *
 *     new average = (on hand x old average + received x what it cost)
 *                   -------------------------------------------------
 *                            on hand + received
 *
 * Shops that keep batches still have the exact cost of each delivery on the
 * batch itself, so nothing is lost: the average is the product level
 * summary, the batch is the detail.
 *
 * WHICH MOVEMENTS MOVE IT
 *
 * Only goods arriving with a price attached: a purchase, an opening
 * balance, a transfer in. Deliberately NOT a sale reversal, a customer
 * return or an order restock, because those goods left at the average and
 * come back at it; re-averaging them against a stale figure would make the
 * number drift every time somebody changed their mind at the counter. And
 * not a stock count or wastage, which change how much is there, not what it
 * cost.
 */

const D = (v: unknown) => new Prisma.Decimal(v as never)

/** The movement kinds that are goods arriving at a known price. */
export const COSTING_KINDS: StockMovementKind[] = ["PURCHASE", "OPENING_BALANCE", "TRANSFER_IN"]

export function movesTheAverage(kind: StockMovementKind, quantity: Prisma.Decimal): boolean {
  return COSTING_KINDS.includes(kind) && quantity.greaterThan(0)
}

/**
 * The new average, given what was there and what has just arrived.
 *
 * `onHandBefore` is clamped at zero: a product that was oversold sits at a
 * negative figure, and letting that weight the arithmetic would produce a
 * cost that is wrong in an interesting direction rather than merely wrong.
 *
 * With no previous average, the arrival IS the average. With a previous
 * average and nothing on hand, likewise: there is no old stock left for it
 * to describe.
 */
export function weightedAverage(input: {
  onHandBefore: Prisma.Decimal | number | string
  oldAverage: Prisma.Decimal | number | string | null
  receivedQty: Prisma.Decimal | number | string
  receivedUnitCost: Prisma.Decimal | number | string
}): Prisma.Decimal {
  const received = D(input.receivedQty)
  const cost = D(input.receivedUnitCost)
  if (input.oldAverage === null) return cost

  const before = D(input.onHandBefore)
  const onHand = before.greaterThan(0) ? before : D(0)
  if (onHand.isZero()) return cost

  const total = onHand.plus(received)
  if (total.lessThanOrEqualTo(0)) return cost

  return onHand.times(D(input.oldAverage)).plus(received.times(cost)).dividedBy(total)
}

/** Rounded the way money is stored: two places, half up. */
export function asMoney(d: Prisma.Decimal): Prisma.Decimal {
  return d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
}
