import { languages, languageNames, type Language } from "./types"
import { commonDictionary } from "./dictionaries/common"
import { authDictionary } from "./dictionaries/auth"
import { customerDictionary } from "./dictionaries/customer"
import { providerDictionary } from "./dictionaries/provider"
import { shopkeeperDictionary } from "./dictionaries/shopkeeper"
import { distributorDictionary } from "./dictionaries/distributor"
import { agentDictionary } from "./dictionaries/agent"
import { secretaryDictionary } from "./dictionaries/secretary"
import { subAdminDictionary } from "./dictionaries/subAdmin"
import { adminDictionary } from "./dictionaries/admin"

export { languages, languageNames }
export type { Language }

export const translations = {
  en: {
    ...commonDictionary.en, ...authDictionary.en, ...customerDictionary.en, ...providerDictionary.en,
    ...shopkeeperDictionary.en, ...distributorDictionary.en, ...agentDictionary.en, ...secretaryDictionary.en,
    ...subAdminDictionary.en, ...adminDictionary.en,
  },
  sw: {
    ...commonDictionary.sw, ...authDictionary.sw, ...customerDictionary.sw, ...providerDictionary.sw,
    ...shopkeeperDictionary.sw, ...distributorDictionary.sw, ...agentDictionary.sw, ...secretaryDictionary.sw,
    ...subAdminDictionary.sw, ...adminDictionary.sw,
  },
  fr: {
    ...commonDictionary.fr, ...authDictionary.fr, ...customerDictionary.fr, ...providerDictionary.fr,
    ...shopkeeperDictionary.fr, ...distributorDictionary.fr, ...agentDictionary.fr, ...secretaryDictionary.fr,
    ...subAdminDictionary.fr, ...adminDictionary.fr,
  },
} as const

export type TranslationKey = keyof typeof translations["en"]

export function t(key: TranslationKey, language: Language = "en", params?: Record<string, string | number>): string {
  const raw = translations[language]?.[key] ?? translations.en[key] ?? key
  if (!params) return raw
  return Object.entries(params).reduce((s, [k, v]) => s.replaceAll(`{{${k}}}`, String(v)), raw as string)
}

// Pragmatic one/other pluralization — not full ICU MessageFormat. Expects
// sibling keys `${baseKey}.one` and `${baseKey}.other` in the dictionaries.
export function tn(
  baseKey: string,
  count: number,
  language: Language = "en",
  params?: Record<string, string | number>,
): string {
  const key = `${baseKey}.${count === 1 ? "one" : "other"}` as TranslationKey
  return t(key, language, { count, ...params })
}
