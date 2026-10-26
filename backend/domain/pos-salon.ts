export const SALON_STATES = ["AWAITING_DEPOSIT", "BOOKED", "CHECKED_IN", "IN_SERVICE", "COMPLETED", "CANCELLED", "NO_SHOW"] as const
export type SalonStatus = typeof SALON_STATES[number]
export const SALON_TRANSITIONS: Record<SalonStatus, readonly SalonStatus[]> = {
  AWAITING_DEPOSIT: ["CANCELLED"],
  BOOKED: ["CHECKED_IN", "CANCELLED", "NO_SHOW"], CHECKED_IN: ["IN_SERVICE", "CANCELLED"],
  IN_SERVICE: ["COMPLETED"], COMPLETED: [], CANCELLED: [], NO_SHOW: [],
}
export function salonDay(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00+03:00`)
  return Number.isFinite(date.getTime()) && new Date(date.getTime() + 10_800_000).toISOString().slice(0, 10) === value ? date : null
}
export function salonStart(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) || !salonDay(value.slice(0, 10)) || Number(value.slice(11, 13)) > 23 || Number(value.slice(14)) > 59) return null
  return new Date(`${value}:00+03:00`)
}
export function salonCommission(base: number, basisPoints: number, returned: number, saleStatus: string) {
  if (!["COMPLETED", "PART_REFUNDED"].includes(saleStatus)) return 0
  return Math.round(Math.max(0, base) * basisPoints / 10_000 * Math.max(0, 1 - returned) * 100) / 100
}
export function salonPhone(value: string | null) {
  const number = (value ?? "").replace(/\D/g, "")
  return /^0[17]\d{8}$/.test(number) ? `254${number.slice(1)}` : number
}
