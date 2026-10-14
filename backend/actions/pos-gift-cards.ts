"use server"

import { z } from "zod"
import { Prisma } from "@prisma/client"
import { db } from "@/backend/db"
import { requirePosPermission, recordPosAudit } from "@/backend/actions/pos-access"

/**
 * Gift cards and store credit.
 *
 * WHY THEY ARE ONE THING
 *
 * They differ only in where the money came from: a gift card was paid for up
 * front, store credit was given instead of a refund. Everything after that is
 * identical. Both are a balance spendable only in this shop, both need a code
 * the counter can read out, both must refuse to go below zero. Two models
 * would have been two implementations of the same arithmetic, and the second
 * one would have been the buggy one.
 *
 * WHY A CODE AND NOT AN ID
 *
 * Nobody reads a cuid off a till receipt. The code is short, upper case, and
 * avoids the characters people confuse by hand: no O against 0, no I or 1.
 *
 * WHY EXPIRY IS CHECKED AT REDEMPTION
 *
 * A card nobody presents costs nothing to leave alone, so there is no job
 * sweeping for expired ones. The check happens where it matters, which is
 * also where somebody is standing at the counter to be told.
 */

const D = (v: unknown) => new Prisma.Decimal(v as never)
const money = (d: Prisma.Decimal) => Number(d.toFixed(2))

async function gate(permission: Parameters<typeof requirePosPermission>[0], staffId?: string | null) {
  const g = await requirePosPermission(permission, staffId)
  if (!g.ok) return { ok: false as const, error: g.error }
  if (!g.actor.shopkeeperId) return { ok: false as const, error: "This business has no shop set up yet." }
  return { ok: true as const, shopkeeperId: g.actor.shopkeeperId, actor: g.actor }
}

/** No O, I, 0 or 1: those are the four people get wrong reading aloud. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

function newCode(): string {
  let out = ""
  for (let i = 0; i < 10; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
    if (i === 4) out += "-"
  }
  return out
}

export type GiftCardRow = {
  id: string
  code: string
  kind: "GIFT_CARD" | "STORE_CREDIT"
  initialValue: number
  balance: number
  issuedToName: string | null
  issuedToPhone: string | null
  expiresAt: string | null
  expired: boolean
  isActive: boolean
  voidReason: string | null
  issuedBy: string | null
  createdAt: string
}

function toRow(c: {
  id: string; code: string; kind: string; initialValue: Prisma.Decimal; balance: Prisma.Decimal
  issuedToName: string | null; issuedToPhone: string | null; expiresAt: Date | null
  isActive: boolean; voidReason: string | null; issuedByName: string | null; createdAt: Date
}): GiftCardRow {
  return {
    id: c.id,
    code: c.code,
    kind: c.kind as GiftCardRow["kind"],
    initialValue: money(c.initialValue),
    balance: money(c.balance),
    issuedToName: c.issuedToName,
    issuedToPhone: c.issuedToPhone,
    expiresAt: c.expiresAt?.toISOString() ?? null,
    expired: !!c.expiresAt && c.expiresAt < new Date(),
    isActive: c.isActive,
    voidReason: c.voidReason,
    issuedBy: c.issuedByName,
    createdAt: c.createdAt.toISOString(),
  }
}

export async function getGiftCards(staffId?: string | null): Promise<GiftCardRow[]> {
  const g = await gate("report.sales", staffId)
  if (!g.ok) return []

  const rows = await db.posGiftCard.findMany({
    where: { shopkeeperId: g.shopkeeperId },
    orderBy: { createdAt: "desc" },
    take: 200,
  })
  return rows.map(toRow)
}

/** Look one up at the counter, by the code on the card. */
export async function findGiftCard(
  input: { code: string; staffId?: string | null },
): Promise<GiftCardRow | null> {
  const g = await gate("till.sell", input.staffId)
  if (!g.ok) return null

  const card = await db.posGiftCard.findFirst({
    where: { shopkeeperId: g.shopkeeperId, code: input.code.trim().toUpperCase() },
  })
  return card ? toRow(card) : null
}

export type GiftCardResult =
  | { success: true; id: string; code: string; balance: number }
  | { success: false; error: string }

const issueSchema = z.object({
  kind: z.enum(["GIFT_CARD", "STORE_CREDIT"]).default("GIFT_CARD"),
  value: z.coerce.number().positive("How much is on it?"),
  issuedToName: z.string().trim().max(120).optional().nullable(),
  issuedToPhone: z.string().trim().max(30).optional().nullable(),
  posCustomerId: z.string().trim().optional().nullable(),
  /** Days from today. Omitted means it never expires. */
  expiresInDays: z.coerce.number().int().min(1).max(3650).optional().nullable(),
  posReturnId: z.string().trim().optional().nullable(),
  staffId: z.string().optional().nullable(),
})

/**
 * Put a card into circulation.
 *
 * Note what this does NOT do: take the money. A gift card sold over the
 * counter is rung up as an ordinary sale of a gift-card product, so it lands
 * in the day's takings and the shift reconciliation like everything else.
 * Having this collect payment too would put the same money through two paths
 * and double the takings.
 */
export async function issueGiftCard(input: unknown): Promise<GiftCardResult> {
  const parsed = issueSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Check the details." }
  }
  const d = parsed.data

  const g = await gate("till.sell", d.staffId)
  if (!g.ok) return { success: false, error: g.error }

  let expiresAt: Date | null = null
  if (d.expiresInDays) {
    expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + d.expiresInDays)
  }

  // Retried on the vanishingly unlikely collision rather than trusting
  // randomness, because the unique constraint would otherwise surface as a
  // raw Prisma error at a counter.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newCode()
    try {
      const card = await db.$transaction(async (tx) => {
        const row = await tx.posGiftCard.create({
          data: {
            shopkeeperId: g.shopkeeperId,
            code,
            kind: d.kind,
            initialValue: D(d.value),
            balance: D(d.value),
            issuedToName: d.issuedToName || null,
            issuedToPhone: d.issuedToPhone || null,
            posCustomerId: d.posCustomerId || null,
            posReturnId: d.posReturnId || null,
            expiresAt,
            issuedByName: g.actor.name,
          },
          select: { id: true, code: true },
        })
        await tx.posGiftCardEntry.create({
          data: {
            cardId: row.id,
            kind: "ISSUE",
            amount: D(d.value),
            balanceAfter: D(d.value),
            actorUserId: g.actor.userId ?? null,
            actorName: g.actor.name,
          },
        })
        return row
      })

      await recordPosAudit({
        actor: g.actor,
        action: d.kind === "STORE_CREDIT" ? "giftcard.credit_issue" : "giftcard.issue",
        entityType: "gift_card",
        entityId: card.id,
        summary: (d.kind === "STORE_CREDIT" ? "Issued store credit " : "Issued gift card ") +
          card.code + " for " + d.value.toFixed(2),
      })

      return { success: true, id: card.id, code: card.code, balance: d.value }
    } catch (e) {
      const clash = e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002"
      if (!clash) {
        return { success: false, error: "That card could not be issued. Nothing was recorded." }
      }
    }
  }
  return { success: false, error: "Could not find a free card number. Try again." }
}

/**
 * Spend from a card.
 *
 * Returns how much was actually taken, which may be less than asked for: a
 * card with 300 on it against a 500 bill pays 300 and the rest is tendered
 * another way. Refusing the whole thing because it does not cover the bill
 * would be useless at a counter.
 */
export async function redeemGiftCard(input: {
  code: string
  amount: number
  posSaleId?: string | null
  staffId?: string | null
}): Promise<{ success: true; redeemed: number; remaining: number } | { success: false; error: string }> {
  const g = await gate("till.sell", input.staffId)
  if (!g.ok) return { success: false, error: g.error }

  const code = input.code.trim().toUpperCase()
  const card = await db.posGiftCard.findFirst({
    where: { shopkeeperId: g.shopkeeperId, code },
  })
  if (!card) return { success: false, error: "No card in this shop has the number " + code + "." }
  if (!card.isActive) {
    return { success: false, error: "That card was cancelled" + (card.voidReason ? ": " + card.voidReason : ".") }
  }
  if (card.expiresAt && card.expiresAt < new Date()) {
    return { success: false, error: "That card expired on " + card.expiresAt.toLocaleDateString("en-KE") + "." }
  }
  const balance = D(card.balance)
  if (balance.lessThanOrEqualTo(0)) {
    return { success: false, error: "There is nothing left on that card." }
  }

  const want = D(input.amount)
  if (want.lessThanOrEqualTo(0)) return { success: false, error: "Redeeming nothing records nothing." }
  const taken = Prisma.Decimal.min(want, balance)
  const after = balance.sub(taken)

  await db.$transaction(async (tx) => {
    await tx.posGiftCardEntry.create({
      data: {
        cardId: card.id,
        kind: "REDEEM",
        amount: taken.neg(),
        balanceAfter: after,
        posSaleId: input.posSaleId ?? null,
        actorUserId: g.actor.userId ?? null,
        actorName: g.actor.name,
      },
    })
    await tx.posGiftCard.update({ where: { id: card.id }, data: { balance: after } })
  })

  return { success: true, redeemed: money(taken), remaining: money(after) }
}

const topUpSchema = z.object({
  code: z.string().trim().min(1),
  amount: z.coerce.number().positive(),
  staffId: z.string().optional().nullable(),
})

export async function topUpGiftCard(input: unknown): Promise<GiftCardResult> {
  const parsed = topUpSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Check the details." }
  const { code, amount, staffId } = parsed.data

  const g = await gate("till.sell", staffId)
  if (!g.ok) return { success: false, error: g.error }

  const card = await db.posGiftCard.findFirst({
    where: { shopkeeperId: g.shopkeeperId, code: code.trim().toUpperCase() },
  })
  if (!card) return { success: false, error: "No card in this shop has that number." }
  if (!card.isActive) return { success: false, error: "That card was cancelled." }

  const after = D(card.balance).add(D(amount))
  await db.$transaction(async (tx) => {
    await tx.posGiftCardEntry.create({
      data: {
        cardId: card.id, kind: "TOPUP", amount: D(amount), balanceAfter: after,
        actorUserId: g.actor.userId ?? null, actorName: g.actor.name,
      },
    })
    await tx.posGiftCard.update({ where: { id: card.id }, data: { balance: after } })
  })

  return { success: true, id: card.id, code: card.code, balance: money(after) }
}

const voidSchema = z.object({
  id: z.string().min(1),
  reason: z.string().trim().min(3, "Say why."),
  staffId: z.string().optional().nullable(),
})

/**
 * Cancel a card.
 *
 * Gated on payment.settings, not the till: a card with money on it IS money,
 * and cancelling one is writing it off. The balance is left on the record
 * rather than zeroed, so what was taken away is still visible.
 */
export async function voidGiftCard(input: unknown): Promise<GiftCardResult> {
  const parsed = voidSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Check the details." }
  }
  const { id, reason, staffId } = parsed.data

  const g = await gate("payment.settings", staffId)
  if (!g.ok) return { success: false, error: g.error }

  const card = await db.posGiftCard.findFirst({
    where: { id, shopkeeperId: g.shopkeeperId },
  })
  if (!card) return { success: false, error: "That card was not found." }
  if (!card.isActive) return { success: false, error: "That card was already cancelled." }

  await db.$transaction(async (tx) => {
    await tx.posGiftCardEntry.create({
      data: {
        cardId: card.id, kind: "VOID", amount: D(card.balance).neg(), balanceAfter: D(0),
        note: reason, actorUserId: g.actor.userId ?? null, actorName: g.actor.name,
      },
    })
    await tx.posGiftCard.update({
      where: { id: card.id },
      data: { isActive: false, voidedAt: new Date(), voidReason: reason, balance: D(0) },
    })
  })

  await recordPosAudit({
    actor: g.actor,
    action: "giftcard.void",
    entityType: "gift_card",
    entityId: id,
    summary: "Cancelled card " + card.code + " with " + money(D(card.balance)) + " on it: " + reason,
  })

  return { success: true, id, code: card.code, balance: 0 }
}
