"use server"

import { z } from "zod"
import { db } from "@/lib/db"
import { requireAdmin, logAdminAction } from "@/lib/actions/admin-dashboard"
import { DEFAULT_EXCHANGE_RATES, type ExchangeRateRow } from "@/lib/currency"

function toRow(r: { code: string; name: string; symbol: string; rate: unknown; isBase: boolean; isActive: boolean }): ExchangeRateRow {
  return { code: r.code, name: r.name, symbol: r.symbol, rate: Number(r.rate), isBase: r.isBase, isActive: r.isActive }
}

export async function getExchangeRatesForAdmin(): Promise<ExchangeRateRow[]> {
  const admin = await requireAdmin()
  if (!admin) return DEFAULT_EXCHANGE_RATES

  const rows = await db.exchangeRate.findMany({ orderBy: { code: "asc" } })
  if (rows.length === 0) return DEFAULT_EXCHANGE_RATES
  return rows.map(toRow)
}

/** No admin gate — every visitor's LocalizationProvider calls this to know
 * the current conversion rates. Falls back to the hardcoded defaults on an
 * empty table or a transient DB error, so currency display is never blocked
 * by this call under this environment's documented Supabase-pooler latency. */
export async function getActiveExchangeRates(): Promise<ExchangeRateRow[]> {
  const rows = await db.exchangeRate.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }).catch(() => null)
  if (!rows || rows.length === 0) return DEFAULT_EXCHANGE_RATES
  return rows.map(toRow)
}

export type ExchangeRateActionResult = { success: true } | { success: false; error: string }

const rateInputSchema = z.object({
  code: z.string().trim().min(3).max(4).toUpperCase(),
  name: z.string().trim().min(1).max(60),
  symbol: z.string().trim().min(1).max(10),
  rate: z.number().positive(),
})

const bulkUpdateSchema = z.array(rateInputSchema).min(1)

export async function updateExchangeRates(input: unknown): Promise<ExchangeRateActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { success: false, error: "You must be signed in as an admin." }

  const parsed = bulkUpdateSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  await db.$transaction(async (tx) => {
    for (const row of parsed.data) {
      await tx.exchangeRate.upsert({
        where: { code: row.code },
        update: { name: row.name, symbol: row.symbol, rate: row.code === "KES" ? 1 : row.rate, updatedById: admin.userId },
        create: {
          code: row.code, name: row.name, symbol: row.symbol,
          rate: row.code === "KES" ? 1 : row.rate,
          isBase: row.code === "KES",
          updatedById: admin.userId,
        },
      })
    }
  }, { timeout: 15000, maxWait: 10000 })

  await logAdminAction({
    userId: admin.userId,
    action: "exchange_rates.update",
    entityType: "ExchangeRate",
    entityId: "bulk",
    newValues: { codes: parsed.data.map((r) => r.code) },
  })

  return { success: true }
}

export async function setExchangeRateActive(code: string, isActive: boolean): Promise<ExchangeRateActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { success: false, error: "You must be signed in as an admin." }

  const existing = await db.exchangeRate.findUnique({ where: { code } })
  if (!existing) return { success: false, error: "Currency not found." }
  if (existing.isBase) return { success: false, error: "The base currency (KES) cannot be disabled." }

  await db.exchangeRate.update({ where: { code }, data: { isActive, updatedById: admin.userId } })
  await logAdminAction({
    userId: admin.userId,
    action: "exchange_rates.set_active",
    entityType: "ExchangeRate",
    entityId: code,
    newValues: { isActive },
  })
  return { success: true }
}
