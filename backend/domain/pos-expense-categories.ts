/**
 * What a shop spends money on, besides stock.
 *
 * A plain module rather than a constant beside the actions, because a
 * "use server" file may export only async functions and a list exported
 * from one fails at request time with no error on screen.
 *
 * The categories are the ones a Kenyan shop actually writes in a book, in
 * roughly the order they hurt. Stock is absent on purpose: goods for resale
 * are a purchase order and a stock movement already, and recording them
 * here as well would count the same money twice in the same month.
 */

export const POS_EXPENSE_CATEGORIES = [
  "RENT",
  "SALARIES",
  "ELECTRICITY",
  "WATER",
  "TRANSPORT",
  "AIRTIME_INTERNET",
  "LICENCES",
  "REPAIRS",
  "PACKAGING",
  "BANK_CHARGES",
  "MARKETING",
  "SECURITY",
  "CLEANING",
  "OTHER",
] as const

export type PosExpenseCategoryKey = (typeof POS_EXPENSE_CATEGORIES)[number]

export const EXPENSE_CATEGORY_LABEL: Record<PosExpenseCategoryKey, string> = {
  RENT: "Rent",
  SALARIES: "Wages and salaries",
  ELECTRICITY: "Electricity",
  WATER: "Water",
  TRANSPORT: "Transport and delivery",
  AIRTIME_INTERNET: "Airtime and internet",
  LICENCES: "Licences and permits",
  REPAIRS: "Repairs and maintenance",
  PACKAGING: "Packaging and bags",
  BANK_CHARGES: "Bank and M-Pesa charges",
  MARKETING: "Advertising",
  SECURITY: "Security",
  CLEANING: "Cleaning",
  OTHER: "Something else",
}

/** A word of help where the name alone leaves room for doubt. */
export const EXPENSE_CATEGORY_HINT: Partial<Record<PosExpenseCategoryKey, string>> = {
  SALARIES: "What you pay the people who work here, including casuals.",
  TRANSPORT: "Fuel, a boda, a lorry. Not the goods themselves.",
  BANK_CHARGES: "Withdrawal fees, paybill charges, bank ledger fees.",
  LICENCES: "The county permit, the trade licence, a health certificate.",
  OTHER: "Anything that fits nowhere else. Say what it was in the description.",
}
