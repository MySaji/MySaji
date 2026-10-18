/**
 * The vocabulary the till reports are expressed in.
 *
 * Here rather than in lib/actions/pos-reports.ts because that file is
 * `"use server"`, and such a module may export ONLY async functions. An
 * exported array compiles cleanly under `tsc` and survives `next build`;
 * it fails at request time with "A 'use server' file can only export async
 * functions, found object", by which point the page is a 500 and the only
 * thing that catches it is loading it in a browser.
 *
 * Same split as lib/pro-modules.ts beside lib/actions/pro-capabilities.ts,
 * and lib/verification-capabilities.ts beside lib/verification-gate.ts.
 */

export const REPORT_RANGES = ["today", "7d", "30d"] as const
export type ReportRange = (typeof REPORT_RANGES)[number]

export const REPORT_RANGE_LABEL: Record<ReportRange, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
}

/** Midnight at the start of the window, in the server's local time. */
export function reportRangeStart(range: ReportRange, now: Date = new Date()): Date {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  if (range === "7d") d.setDate(d.getDate() - 6)
  if (range === "30d") d.setDate(d.getDate() - 29)
  return d
}

/** Calendar slots follow the UTC day keys returned by the report action. */
export function reportTrend(rows: { day: string; amount: number; count: number }[], from: string, to: string) {
  const start = new Date(from.slice(0, 10) + "T00:00:00Z")
  const end = new Date(to.slice(0, 10) + "T00:00:00Z")
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return []
  const byDay = new Map(rows.map(row => [row.day, row]))
  const result: { day: string; amount: number; count: number; label: string }[] = []
  for (const cursor = new Date(start); cursor <= end && result.length < 32; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const day = cursor.toISOString().slice(0, 10)
    result.push({ day, amount: 0, count: 0, ...byDay.get(day), label: cursor.toLocaleDateString("en-KE", { day: "numeric", month: "short", timeZone: "UTC" }) })
  }
  return result
}
