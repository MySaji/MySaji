export const currencies = {
  KES: { name: "Kenyan Shilling", symbol: "KES", code: "KES", rate: 1 },
  USD: { name: "US Dollar", symbol: "$", code: "USD", rate: 0.0077 },
  EUR: { name: "Euro", symbol: "€", code: "EUR", rate: 0.0072 },
  GBP: { name: "British Pound", symbol: "£", code: "GBP", rate: 0.0061 },
  TZS: { name: "Tanzanian Shilling", symbol: "TZS", code: "TZS", rate: 19.5 },
  UGX: { name: "Ugandan Shilling", symbol: "UGX", code: "UGX", rate: 28.5 },
  ZAR: { name: "South African Rand", symbol: "R", code: "ZAR", rate: 0.13 },
} as const

export type CurrencyCode = keyof typeof currencies

export const locationToCurrency: Record<string, CurrencyCode> = {
  KE: "KES",
  TZ: "TZS",
  UG: "UGX",
  ZA: "ZAR",
  US: "USD",
  GB: "GBP",
  EU: "EUR",
}

export type ExchangeRateRow = {
  code: string
  name: string
  symbol: string
  rate: number
  isBase: boolean
  isActive: boolean
}

// Fallback table used whenever the ExchangeRate DB table is empty or
// unreachable, so currency conversion never hard-fails — same values as
// the original hardcoded `currencies` table above, just reshaped.
export const DEFAULT_EXCHANGE_RATES: ExchangeRateRow[] = Object.values(currencies).map((c) => ({
  code: c.code,
  name: c.name,
  symbol: c.symbol,
  rate: c.rate,
  isBase: c.code === "KES",
  isActive: true,
}))

const LOCALE_BY_LANGUAGE: Record<string, string> = {
  en: "en-KE",
  sw: "sw-KE",
  fr: "fr-FR",
}

// `amountInKES` is always the base amount as stored in the DB (every
// Payment/Wallet/Product price is authored in KES) — `rate` is units of
// `toCurrency` per 1 KES, so a straight multiply converts it.
export function convertAmount(amountInKES: number, toCurrency: string, rates: Record<string, ExchangeRateRow>): number {
  const rate = rates[toCurrency]?.rate ?? 1
  return amountInKES * rate
}

export function formatMoney(
  amountInKES: number,
  toCurrency: string,
  rates: Record<string, ExchangeRateRow>,
  language: string = "en",
): string {
  const converted = convertAmount(amountInKES, toCurrency, rates)
  const locale = LOCALE_BY_LANGUAGE[language] ?? "en-KE"
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: toCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(converted)
  } catch {
    const symbol = rates[toCurrency]?.symbol ?? toCurrency
    return `${symbol} ${converted.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
}
