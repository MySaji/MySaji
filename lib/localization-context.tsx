"use client"

import { createContext, useState, useEffect, useMemo, useCallback, type ReactNode } from "react"
import useSWR from "swr"
import { useSession } from "next-auth/react"
import { t as translate, tn as translateN, type Language, type TranslationKey } from "@/lib/i18n"
import { DEFAULT_EXCHANGE_RATES, formatMoney as formatMoneyUtil, type ExchangeRateRow } from "@/lib/currency"
import { getActiveExchangeRates } from "@/lib/actions/exchange-rates"
import { updateMyLocalePreference } from "@/lib/actions/user-preferences"
import { withTimeout } from "@/lib/swr-utils"

export interface LocalizationContextType {
  language: Language
  setLanguage: (lang: Language) => void
  currency: string
  setCurrency: (code: string) => void
  theme: "light" | "dark"
  setTheme: (theme: "light" | "dark") => void
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
  tn: (baseKey: string, count: number, params?: Record<string, string | number>) => string
  formatMoney: (amountInKES: number, currencyOverride?: string) => string
}

export const LocalizationContext = createContext<LocalizationContextType | undefined>(undefined)

export function LocalizationProvider({ children }: { children: ReactNode }) {
  const { data: session, update } = useSession()
  const [language, setLanguageState] = useState<Language>("en")
  const [currency, setCurrencyState] = useState<string>("KES")
  const [theme, setThemeState] = useState<"light" | "dark">("light")
  const [mounted, setMounted] = useState(false)

  // Signed-in users: DB-backed preference (via the session) is the source of
  // truth. Guests (no session — landing page, auth pages): localStorage only,
  // same as before.
  useEffect(() => {
    if (session?.user) {
      setLanguageState((session.user.language as Language) || "en")
      setCurrencyState(session.user.currency || "KES")
    } else {
      const savedLang = (localStorage.getItem("saji-language") as Language) || "en"
      const savedCurrency = localStorage.getItem("saji-currency") || "KES"
      setLanguageState(savedLang)
      setCurrencyState(savedCurrency)
    }
    const savedTheme = (localStorage.getItem("saji-theme") as "light" | "dark") || "light"
    setThemeState(savedTheme)
    setMounted(true)
    applyTheme(savedTheme)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.language, session?.user?.currency])

  // Fetched once per app session (this provider mounts once at the root
  // layout) — non-blocking, falls back to the static defaults on a timeout
  // or error, matching this environment's documented Supabase-pooler
  // latency and the established SWR + withTimeout resilience pattern.
  const { data: rateRows } = useSWR<ExchangeRateRow[]>(
    "exchange-rates",
    () => withTimeout(getActiveExchangeRates(), 10000),
    { revalidateOnFocus: false, dedupingInterval: 5 * 60 * 1000, fallbackData: DEFAULT_EXCHANGE_RATES },
  )
  const rates = useMemo(() => {
    const rows = rateRows ?? DEFAULT_EXCHANGE_RATES
    return Object.fromEntries(rows.map((r) => [r.code, r])) as Record<string, ExchangeRateRow>
  }, [rateRows])

  const persist = useCallback(async (nextLanguage: Language, nextCurrency: string) => {
    if (!session?.user) return
    const result = await updateMyLocalePreference({ language: nextLanguage, currency: nextCurrency })
    if (result.success) await update({})
  }, [session?.user, update])

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang)
    localStorage.setItem("saji-language", lang)
    void persist(lang, currency)
  }, [currency, persist])

  const setCurrency = useCallback((code: string) => {
    setCurrencyState(code)
    localStorage.setItem("saji-currency", code)
    void persist(language, code)
  }, [language, persist])

  const setTheme = (newTheme: "light" | "dark") => {
    setThemeState(newTheme)
    localStorage.setItem("saji-theme", newTheme)
    applyTheme(newTheme)
  }

  const applyTheme = (themeValue: "light" | "dark") => {
    const html = document.documentElement
    html.classList.toggle("dark", themeValue === "dark")
  }

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>) => translate(key, language, params),
    [language],
  )
  const tn = useCallback(
    (baseKey: string, count: number, params?: Record<string, string | number>) => translateN(baseKey, count, language, params),
    [language],
  )
  const formatMoney = useCallback(
    (amountInKES: number, currencyOverride?: string) => formatMoneyUtil(amountInKES, currencyOverride ?? currency, rates, language),
    [currency, rates, language],
  )

  return (
    <LocalizationContext.Provider
      value={{ language, setLanguage, currency, setCurrency, theme, setTheme, t, tn, formatMoney }}
    >
      {mounted ? children : null}
    </LocalizationContext.Provider>
  )
}
