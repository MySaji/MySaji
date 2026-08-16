"use server"

import { z } from "zod"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { languages, type Language } from "@/lib/i18n"

export type LocalePreference = { language: Language; currency: string }

export async function getMyLocalePreference(): Promise<LocalePreference> {
  const session = await auth()
  if (!session?.user?.id) return { language: "en", currency: "KES" }

  const user = await db.user.findUnique({ where: { id: session.user.id }, select: { language: true, currency: true } })
  if (!user) return { language: "en", currency: "KES" }
  return { language: (user.language as Language) ?? "en", currency: user.currency ?? "KES" }
}

export type LocalePreferenceActionResult = { success: true } | { success: false; error: string }

const localePreferenceSchema = z.object({
  language: z.enum(languages),
  currency: z.string().trim().min(3).max(4).toUpperCase(),
})

export async function updateMyLocalePreference(input: unknown): Promise<LocalePreferenceActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = localePreferenceSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const rate = await db.exchangeRate.findUnique({ where: { code: parsed.data.currency } })
  // If the admin-managed table has this currency and it's been explicitly
  // disabled, reject it — but an empty table (no rows yet) must not block
  // every preference save, since getActiveExchangeRates() falls back to the
  // hardcoded defaults in that case too.
  if (rate && !rate.isActive) return { success: false, error: "That currency is not currently supported." }

  await db.user.update({
    where: { id: session.user.id },
    data: { language: parsed.data.language, currency: parsed.data.currency },
  })
  return { success: true }
}
