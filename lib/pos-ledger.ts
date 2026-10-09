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
 * BOTH CHANNELS WRITE HERE
 * ---------------------------------------------------------------------------
 * A till sale and a marketplace order come off the same figure. checkout(),
 * order cancellation and shop returns all append through
 * recordOrderMovements below, so "how did this shop get to eleven crates"
 * has one answer covering both.
 *
 * They use a DIFFERENT function from the till for a reason worth reading
 * before changing either: checkout is concurrent and its transaction is
 * already long, so it adjusts atomically and in batch, while the till
 * computes a running balance it can print. See recordOrderMovements.
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
    createMany: (args: unknown) => Promise<unknown>
  }
}

const D = (v: Prisma.Decimal | string | number) => new Prisma.Decimal(v)

/**
 * The idempotency key for a product's opening-balance row.
 *
 * Deterministic on purpose. A product can only ever have ONE opening
 * balance, and the unique index on (shopkeeperId, idempotencyKey) is what
 * enforces that against concurrent writers rather than hoping no two of them
 * seed at once. Namespaced so it cannot collide with a device-issued key.
 */
function openingKey(productId: string): string {
  return `seed:opening:${productId}`
}

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
      // createMany with the same deterministic key as the batched path, for
      // the same reason: two writers that both find no ledger would
      // otherwise both seed one. Less likely at a single counter than during
      // checkout, but the same bug, and the fix costs nothing.
      await tx.stockMovement.createMany({
        data: [{
          shopkeeperId: input.shopkeeperId,
          productId: input.productId,
          kind: "OPENING_BALANCE",
          quantity: opening,
          unit: input.unit ?? product.unit,
          balanceAfter: opening,
          reason: "Stock on record when the till started keeping this product's history",
          actorUserId: input.actorUserId ?? null,
          idempotencyKey: openingKey(input.productId),
          occurredAt: input.occurredAt ?? new Date(),
        }],
        skipDuplicates: true,
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

// ---------------------------------------------------------------------------
// Marketplace orders
// ---------------------------------------------------------------------------

export type OrderMovementLine = {
  productId: string
  /** A POSITIVE magnitude. The kind decides the direction, not the caller. */
  quantity: number | string | Prisma.Decimal
}

export type OrderMovementResult =
  | { ok: true; recorded: number; seeded: number }
  | { ok: false; code: "WRONG_TENANT" | "NOT_FOUND"; message: string }

/**
 * Stock moving because of a marketplace Order, rather than a till sale.
 *
 * A SEPARATE FUNCTION FROM recordStockMovement, for two reasons that both
 * come from checkout being a different kind of code than a counter.
 *
 * 1. CONCURRENCY. recordStockMovement reads the balance, decides, and
 *    writes — fine at a till, where one cashier serves one customer at a
 *    time. Checkout is not that: two customers can buy the last unit in the
 *    same millisecond, and the code being replaced here used Prisma's atomic
 *    `decrement` precisely so neither update is lost. Swapping that for a
 *    read-modify-write would introduce a lost-update bug into the most
 *    important path in the application. So this function never computes a
 *    new stock figure; it only ever ADJUSTS by a delta, atomically.
 *
 * 2. QUERY COUNT. recordStockMovement costs about five round trips per
 *    line. Checkout already runs a long transaction — wallets, orders,
 *    payments, commission, notifications — against a database where a round
 *    trip is not free, and this project has hit transaction timeouts before
 *    by adding queries that scale with line count. This batches: four
 *    queries total regardless of how many lines, plus the per-line inventory
 *    updates that were already there.
 *
 * The price of atomicity is `balanceAfter`: it is left NULL on these rows,
 * because the balance after a concurrent adjustment cannot be known without
 * locking the row, and locking inventory during checkout is a far worse
 * trade than losing a convenience column. Till movements still carry it.
 * The ledger SUM remains the truth either way.
 */
export async function recordOrderMovements(
  tx: LedgerTx & {
    product: { findMany: (args: unknown) => Promise<unknown> }
    inventory: { findMany: (args: unknown) => Promise<unknown> }
    stockMovement: { createMany: (args: unknown) => Promise<unknown> }
    $executeRawUnsafe: (sql: string, ...values: unknown[]) => Promise<number>
  },
  input: {
    shopkeeperId: string
    kind: Extract<StockMovementKind, "ORDER_FULFILMENT" | "ORDER_RESTOCK">
    orderId: string
    actorUserId?: string | null
    occurredAt?: Date
    reason?: string | null
    lines: OrderMovementLine[]
  },
): Promise<OrderMovementResult> {
  if (input.lines.length === 0) return { ok: true, recorded: 0, seeded: 0 }

  const occurredAt = input.occurredAt ?? new Date()
  const outward = MOVEMENT_DIRECTION[input.kind] === "out"
  const ids = [...new Set(input.lines.map((l) => l.productId))]

  // Scoped to the shop, as everywhere else. A line naming another shop's
  // product is a bug upstream, not something to record.
  const products = (await tx.product.findMany({
    where: { shopkeeperId: input.shopkeeperId, id: { in: ids } },
    select: { id: true, unit: true, costPrice: true },
  })) as { id: string; unit: string; costPrice: Prisma.Decimal | null }[]

  if (products.length !== ids.length) {
    return {
      ok: false,
      code: "WRONG_TENANT",
      message: "An order line refers to a product this shop does not own.",
    }
  }
  const byId = new Map(products.map((p) => [p.id, p]))

  // Which of these have never had a ledger row? Their integer currentStock
  // is the only record of what is on the shelf, and it has to enter the
  // ledger as an OPENING_BALANCE row before anything is appended — otherwise
  // the balance (a SUM) would start from zero and every figure after it
  // would be wrong. Same rule as recordStockMovement, batched.
  const inventories = (await tx.inventory.findMany({
    where: { productId: { in: ids } },
    select: { productId: true, currentStock: true, stockOnHand: true },
  })) as { productId: string; currentStock: number; stockOnHand: Prisma.Decimal | null }[]

  const needSeeding = inventories.filter((i) => i.stockOnHand === null && i.currentStock !== 0)
  if (needSeeding.length > 0) {
    await tx.stockMovement.createMany({
      data: needSeeding.map((i) => ({
        shopkeeperId: input.shopkeeperId,
        productId: i.productId,
        kind: "OPENING_BALANCE" as const,
        quantity: D(i.currentStock),
        unit: byId.get(i.productId)?.unit ?? "piece",
        balanceAfter: D(i.currentStock),
        reason: "Stock on record when this product's history began",
        idempotencyKey: openingKey(i.productId),
        occurredAt,
      })),
      // THE RACE THIS CLOSES: deciding to seed is a read, and two checkouts
      // for the same never-sold product both read "no ledger yet" and both
      // wrote an opening row. The projections stayed correct, because those
      // move by atomic deltas — but the ledger doubled, so the audit trail
      // disagreed with the shelf. Found by running two checkouts at once;
      // it is invisible to any test that does one thing at a time.
      //
      // The deterministic key plus ON CONFLICT DO NOTHING makes the second
      // insert a no-op: Postgres blocks it until the first commits, then
      // skips it.
      skipDuplicates: true,
    })
  }

  // Seed stockOnHand from each row's OWN currentStock in one statement. A
  // read-then-write would be a lost update under concurrency; this reads and
  // writes the same row inside the database. The IS NULL guard makes it a
  // no-op for anything already seeded, so a race writes the same value twice
  // rather than the wrong value once.
  await tx.$executeRawUnsafe(
    `UPDATE "inventory" SET "stockOnHand" = "currentStock"
     WHERE "productId" = ANY($1::text[]) AND "stockOnHand" IS NULL`,
    ids,
  )

  await tx.stockMovement.createMany({
    data: input.lines.map((l) => {
      const product = byId.get(l.productId)!
      const magnitude = D(l.quantity).abs()
      return {
        shopkeeperId: input.shopkeeperId,
        productId: l.productId,
        kind: input.kind,
        quantity: outward ? magnitude.negated() : magnitude,
        unit: product.unit,
        unitCost: product.costPrice,
        // Deliberately absent. See the note above.
        balanceAfter: null,
        reason: input.reason ?? null,
        orderId: input.orderId,
        actorUserId: input.actorUserId ?? null,
        occurredAt,
      }
    }),
  })

  return { ok: true, recorded: input.lines.length, seeded: needSeeding.length }
}

/**
 * The atomic adjustment to apply alongside recordOrderMovements.
 *
 * Returned as data rather than applied here, because every caller already
 * runs its own `inventory.update` per line and the point is to modify that
 * call rather than add another round trip beside it. Both columns move by
 * the same integer delta, which is what keeps
 * `currentStock === floor(stockOnHand)` true: an Order quantity is an Int,
 * so it can never introduce a fraction that the two would round differently.
 */
export function orderStockDelta(kind: "ORDER_FULFILMENT" | "ORDER_RESTOCK", quantity: number) {
  const magnitude = Math.abs(quantity)
  return MOVEMENT_DIRECTION[kind] === "out"
    ? { currentStock: { decrement: magnitude }, stockOnHand: { decrement: magnitude } }
    : { currentStock: { increment: magnitude }, stockOnHand: { increment: magnitude } }
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
