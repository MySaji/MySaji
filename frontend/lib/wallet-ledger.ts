export type LedgerEntry = { id: string; description: string; amount: number; status: string; date: string }
export function filterLedger(entries: LedgerEntry[], query: string, status: string, direction: string, from: string, to: string) {
  return entries.filter(entry => {
    const date = entry.date.slice(0, 10)
    return `${entry.description} ${entry.id}`.toLowerCase().includes(query.trim().toLowerCase()) && (status === "all" || entry.status === status) && (direction === "all" || (direction === "in" ? entry.amount >= 0 : entry.amount < 0)) && (!from || date >= from) && (!to || date <= to)
  })
}
export function csvCell(value: string | number) {
  const raw = String(value)
  const safe = typeof value === "string" && /^[\s]*[=+@\-\t\r]/.test(raw) ? `'${raw}` : raw
  return `"${safe.replace(/"/g, '""')}"`
}
