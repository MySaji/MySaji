/**
 * The stock ledger: the only place stock is allowed to change.
 *
 * Plain module, not "use server" — it exports types and constants beside the
 * logic, and both callers (the till's server actions, and marketplace order
 * fulfilment) need to call it inside a transaction they already own.
 *
 * ---------------------------------------------------------------------------
 * THE RULE
 * ---------------------------------------------------------------------------
 * Stock is never set. It is only ever moved, by appending a StockMovement.
 * Nothing in the application writes Inventory.stockOnHand except this module,
 * and nothing edits a StockMovement once written — a correction is a new row
 * with the opposite sign.
 *
 * That constraint is what makes the figure defensible. "You have 11 crates"
 * is an assertion; "you had 24, sold 9, lost 3 to breakage on Tuesday and
 * counted 1 short on Friday" is an answer. Only the second one survives a
 * shopkeeper who is certain the system is wrong.
 *
 * ---------------------------------------------------------------------------
 * TWO FIGURES, ONE TRUTH
 * ---------------------------------------------------------------------------
 * Inventory has both `currentStock` (Int, what the marketplace has always
 * read) and `stockOnHand` (Decimal, what the ledger maintains). This module
 * keeps them consistent:
 *
 *     stockOnHand = exact ledger balance
 *     currentStock = floor(stockOnHand), never below zero
 *
 * Flooring rather than rounding is deliberate and is the conservative
 * direction: 0.4 kg of mince is real stock the butchery can sell over the
 * counter, but it is not one sellable unit on the marketplace, and rounding
 * it up to 1 would let a customer order something that does not exist.
 *
 * ---------------------------------------------------------------------------
 * KNOWN GAP: THE MARKETPLACE DOES NOT WRITE THIS LEDGER YET
 * ---------------------------------------------------------------------------
 * `checkout()` in lib/actions/cart.ts decrements `Inventory.currentStock`
 * directly, and order cancellation and returns increment it. None of them
 * append a StockMovement. So for a shop that sells BOTH at a counter and on
 * SAJI, a marketplace order moves `currentStock` without moving the ledger,
 * and the next till movement overwrites `currentStock` from the ledger
 * balance — losing that marketplace sale from the figure.
 *
 * This is why ORDER_FULFILMENT and ORDER_RESTOCK exist in the enum with
 * nothing writing them: routing those three call sites through this module is
 * the "one stock figure, two channels" work, and it touches live checkout, so
 * it is its own change with its own verification rather than a side effect of
 * building the till.
 *
 * Until then the honest position is: the ledger is authoritative for a
 * POS-only shop, and for a POS + Sell Products shop the two channels can
 * drift. reconcileStock() below is how that is detected.
 */

import { Prisma } from "@prisma/client"
import type { NegativeStockPolicy } from "./pos-config"

export type StockMovementKind =
  | "OPENING_BALANCE"
  | "PURCHASE"
  | "SALE"
  | "SALE_REVERSAL"
  | "ORDER_FULFILMENT"
  | "ORDER_RESTOCK"
  | "RETURN"
  | "COUNT_ADJUSTMENT"
  | "WASTAGE"
  | "TRANSFER_IN"
  | "TRANSFER_OUT"
  | "BULK_BREAK_IN"
  | "BULK_BREAK_OUT"

/**
 * Which direction each kind is allowed to move stock.
 *
 * Checked rather than assumed, because the sign is supplied by the caller
 * and a SALE recorded as +2 would silently create stock. A kind whose
 * direction is "either" genuinely can go both ways: a count adjustment
 * corrects in whichever direction the shelf disagrees.
 */
export const MOVEMENT_DIRECTION: Record<StockMovementKind, "in" | "out" | "either"> = {
  OPENING_BALANCE: "either",
  PURCHASE: "in",
  SALE: "out",
  SALE_REVERSAL: "in",
  ORDER_FULFILMENT: "out",
  ORDER_RESTOCK: "in",
  RETURN: "in",
  COUNT_ADJUSTMENT: "either",
  WASTAGE: "out",
  TRANSFER_IN: "in",
  TRANSFER_OUT: "out",
  BULK_BREAK_IN: "in",
  BULK_BREAK_OUT: "out",
}

export type RecordMovementInput = {
  /** The tenant. Never taken from the client; always from the session. */
  shopkeeperId: string
  productId: string
  kind: StockMovementKind
  /**
   * SIGNED. Positive in, negative out. A string or Decimal, not a number:
   * 0.1 + 0.2 is not 0.3 in binary floating point, and a stock figure that
   * drifts by a thousandth per movement is a figure a shopkeeper will
   * eventually catch you on.
   */
  quantity: Prisma.Decimal | string
  unit?: string
  unitCost?: Prisma.Decimal | string | null
  reason?: string | null
  posSaleId?: string | null
  orderId?: string | null
  wholesaleOrderId?: string | null
  actorUserId?: string | null
  /** Set by an offline till so a replay is a no-op. */
  idempotencyKey?: string | null
  deviceId?: string | null
  /** When it happened at the counter. Defaults to now. */
  occurredAt?: Date
}

export type RecordMovementResult =
  | { ok: true; movementId: string; balance: Prisma.Decimal; replayed: boolean }
  | { ok: false; code: "NOT_FOUND" | "WRONG_TENANT" | "BAD_DIRECTION" | "INSUFFICIENT_STOCK"; message: string; available?: Prisma.Decimal }

/** The slice of Prisma this needs, so importing it pulls in no engine. */
type LedgerTx = {
  product: { findUnique: (args: unknown) => Promise<unknown> }
  inventory: {
    findUnique: (args: unknown) => Promise<unknown>
    create: (args: unknown) => Promise<unknown>
    update: (args: unknown) => Promise<unknown>
  }
  stockMovement: {
    findUnique: (args: unknown) => Promise<unknown>
    aggregate: (args: unknown) => Promise<unknown>
    create: (args: unknown) => Promise<unknown>
  }
}

const D = (v: Prisma.Decimal | string | number) => new Prisma.Decimal(v)

/**
 * Append one movement, and bring the projection with it.
 *
 * Must be called inside a transaction. The balance is read, checked and
 * written in three statements, and without one wrapping them two tills
 * selling the last item at the same moment would both see it available.
 */
export async function recordStockMovement(
  tx: LedgerTx,
  input: RecordMovementInput,
  negativeStock: NegativeStockPolicy = "WARN",
): Promise<RecordMovementResult> {
  const qty = D(input.quantity)

  // --- the movement must point the way its kind claims --------------------
  const direction = MOVEMENT_DIRECTION[input.kind]
  if (direction === "in" && qty.lessThanOrEqualTo(0)) {
    return { ok: false, code: "BAD_DIRECTION", message: `${input.kind} must increase stock, so its quantity must be positive.` }
  }
  if (direction === "out" && qty.greaterThanOrEqualTo(0)) {
    return { ok: false, code: "BAD_DIRECTION", message: `${input.kind} must reduce stock, so its quantity must be negative.` }
  }
  if (qty.isZero()) {
    return { ok: false, code: "BAD_DIRECTION", message: "A movement of zero records nothing." }
  }

  // --- the product must belong to THIS shop -------------------------------
  //
  // The single most important line in this module. productId arrives from a
  // till, i.e. from a browser, and a shop that could post a movement against
  // another shop's product could read its stock through the response and
  // corrupt it at the same time. Scoped on both columns, so a mismatch is a
  // miss rather than a check somebody can forget to write.
  const product = (await tx.product.findUnique({
    where: { id: input.productId },
    select: { id: true, shopkeeperId: true, unit: true },
  })) as { id: string; shopkeeperId: string; unit: string } | null

  if (!product) return { ok: false, code: "NOT_FOUND", message: "That product no longer exists." }
  if (product.shopkeeperId !== input.shopkeeperId) {
    // Deliberately the same message a missing product gets: whether another
    // shop holds this id is not something a caller should be able to learn.
    return { ok: false, code: "WRONG_TENANT", message: "That product no longer exists." }
  }

  // --- a replayed offline movement is a no-op, not an error ---------------
  //
  // The unique constraint would refuse the insert anyway, but refusing is
  // the wrong answer to the caller: a till retrying its queue after a dropped
  // connection has done nothing wrong and must be told the movement landed.
  if (input.idempotencyKey) {
    const existing = (await tx.stockMovement.findUnique({
      where: { shopkeeperId_idempotencyKey: { shopkeeperId: input.shopkeeperId, idempotencyKey: input.idempotencyKey } },
      select: { id: true, balanceAfter: true },
    })) as { id: string; balanceAfter: Prisma.Decimal | null } | null
    if (existing) {
      return { ok: true, movementId: existing.id, balance: existing.balanceAfter ?? D(0), replayed: true }
    }
  }

  // --- the balance before this movement -----------------------------------
  const agg = (await tx.stockMovement.aggregate({
    where: { shopkeeperId: input.shopkeeperId, productId: input.productId },
    _sum: { quantity: true },
  })) as { _sum: { quantity: Prisma.Decimal | null } }

  const inv = (await tx.inventory.findUnique({
    where: { productId: input.productId },
    select: { id: true, currentStock: true, stockOnHand: true },
  })) as { id: string; currentStock: number; stockOnHand: Prisma.Decimal | null } | null

  // A product that predates POS has no ledger rows, and its integer
  // currentStock is the only record of what is on the shelf. That figure has
  // to ENTER the ledger, as a row, before anything else is appended.
  //
  // Seeding `before` from it without writing a row was a bug: the balance is
  // SUM(quantity), so the next movement would compute its own balance from
  // the movement rows alone and the opening figure would silently vanish. It
  // only looks correct for exactly one movement — which is why a test that
  // recorded one movement passed and the figure was still wrong.
  //
  // Writing an explicit OPENING_BALANCE row instead means the invariant
  // "balance is the sum of the ledger" holds from the first movement
  // onwards, with no special case anywhere else.
  let ledgerSum = agg._sum.quantity

  if (ledgerSum === null) {
    const opening = inv?.stockOnHand ?? D(inv?.currentStock ?? 0)
    // Not when the caller is itself declaring the opening figure. Someone
    // recording OPENING_BALANCE is stating what is on the shelf; importing
    // the old number as well would add the two together and double it.
    if (!opening.isZero() && input.kind !== "OPENING_BALANCE") {
      await tx.stockMovement.create({
        data: {
          shopkeeperId: input.shopkeeperId,
          productId: input.productId,
          kind: "OPENING_BALANCE",
          quantity: opening,
          unit: input.unit ?? product.unit,
          balanceAfter: opening,
          reason: "Stock on record when the till started keeping this product's history",
          actorUserId: input.actorUserId ?? null,
          occurredAt: input.occurredAt ?? new Date(),
        },
      })
    }
    ledgerSum = opening
  }

  const before = ledgerSum
  const after = before.plus(qty)

  // --- the negative-stock policy ------------------------------------------
  //
  // Only applies to movements that REDUCE stock, and never to a correction:
  // a count that finds less than the ledger claims must be recordable
  // precisely when the ledger is wrong, and blocking it would force the
  // shopkeeper to leave a figure they know is false.
  if (after.lessThan(0) && qty.lessThan(0) && input.kind !== "COUNT_ADJUSTMENT") {
    if (negativeStock === "BLOCK") {
      return {
        ok: false,
        code: "INSUFFICIENT_STOCK",
        message: `Only ${before.toString()} ${input.unit ?? product.unit} left.`,
        available: before,
      }
    }
    // WARN and ALLOW both record it. The difference is in the till's UI, not
    // here: this module must not decide that a sale the shopkeeper confirmed
    // did not happen.
  }

  const movement = (await tx.stockMovement.create({
    data: {
      shopkeeperId: input.shopkeeperId,
      productId: input.productId,
      kind: input.kind,
      quantity: qty,
      unit: input.unit ?? product.unit,
      unitCost: input.unitCost != null ? D(input.unitCost) : null,
      balanceAfter: after,
      reason: input.reason ?? null,
      posSaleId: input.posSaleId ?? null,
      orderId: input.orderId ?? null,
      wholesaleOrderId: input.wholesaleOrderId ?? null,
      actorUserId: input.actorUserId ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      deviceId: input.deviceId ?? null,
      occurredAt: input.occurredAt ?? new Date(),
    },
    select: { id: true },
  })) as { id: string }

  // --- the projection ------------------------------------------------------
  // floor, and never below zero: see the module comment.
  const projected = Math.max(0, Math.floor(Number(after.toString())))

  if (inv) {
    await tx.inventory.update({
      where: { id: inv.id },
      data: {
        stockOnHand: after,
        currentStock: projected,
        ...(qty.greaterThan(0) && (input.kind === "PURCHASE" || input.kind === "TRANSFER_IN")
          ? { lastRestockedAt: input.occurredAt ?? new Date() }
          : {}),
      },
    })
  } else {
    await tx.inventory.create({
      data: { productId: input.productId, stockOnHand: after, currentStock: projected },
    })
  }

  return { ok: true, movementId: movement.id, balance: after, replayed: false }
}

/**
 * The ledger balance for one product, with no side effects.
 *
 * Reads the ledger rather than the projection on purpose: this is the figure
 * used to CHECK the projection, so taking it from the projection would make
 * the check vacuous. See reconcileStock below.
 */
export async function ledgerBalance(
  tx: LedgerTx,
  shopkeeperId: string,
  productId: string,
): Promise<Prisma.Decimal | null> {
  const agg = (await tx.stockMovement.aggregate({
    where: { shopkeeperId, productId },
    _sum: { quantity: true },
  })) as { _sum: { quantity: Prisma.Decimal | null } }
  return agg._sum.quantity
}

/**
 * Does the projection still match the ledger?
 *
 * Nothing calls this in the hot path. It exists because a projection that is
 * never checked is a projection that is eventually wrong, and when a
 * shopkeeper says the stock figure is off, the first question worth
 * answering is whether the ledger and the cache disagree or whether the
 * ledger itself is missing a movement. Those have completely different fixes
 * and look identical from the outside.
 */
export async function reconcileStock(
  tx: LedgerTx,
  shopkeeperId: string,
  productId: string,
): Promise<{ ledger: Prisma.Decimal | null; projection: Prisma.Decimal | null; matches: boolean }> {
  const ledger = await ledgerBalance(tx, shopkeeperId, productId)
  const inv = (await tx.inventory.findUnique({
    where: { productId },
    select: { stockOnHand: true },
  })) as { stockOnHand: Prisma.Decimal | null } | null
  const projection = inv?.stockOnHand ?? null

  if (ledger === null && projection === null) return { ledger, projection, matches: true }
  if (ledger === null || projection === null) return { ledger, projection, matches: false }
  return { ledger, projection, matches: ledger.equals(projection) }
}
