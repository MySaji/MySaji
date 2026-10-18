export type ReceiptLoyalty = { earned: number; redeemed: number; balance: number }
export type ReceiptSnapshot = { version: 1; taxRate: number; taxInclusive: boolean; customerPhone: string | null; loyalty: ReceiptLoyalty | null }

export function receiptSnapshot(value: unknown): ReceiptSnapshot | null {
  if (!value || typeof value !== "object") return null
  const row = value as ReceiptSnapshot
  if (row.version !== 1 || !Number.isFinite(row.taxRate) || row.taxRate < 0 || typeof row.taxInclusive !== "boolean" || (row.customerPhone !== null && typeof row.customerPhone !== "string")) return null
  if (row.loyalty !== null && (!row.loyalty || ![row.loyalty.earned, row.loyalty.redeemed, row.loyalty.balance].every(n => Number.isInteger(n) && n >= 0))) return null
  return row
}

export function loyaltyFromEntries(entries: { kind: string; points: number; balanceAfter: number }[]): ReceiptLoyalty | null {
  const earned = entries.filter(row => row.kind === "EARN")
  const redeemed = entries.filter(row => row.kind === "REDEEM")
  const last = earned.at(-1) ?? redeemed.at(-1)
  return last ? { earned: earned.reduce((sum, row) => sum + row.points, 0), redeemed: -redeemed.reduce((sum, row) => sum + row.points, 0), balance: last.balanceAfter } : null
}

/** Display the stored VAT amount without charging inclusive VAT a second time. */
export function receiptVat(total: number, tax: number) {
  return { net: Math.round((total - tax) * 100) / 100, vat: tax }
}
