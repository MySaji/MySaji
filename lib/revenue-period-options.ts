// Plain client-side helper (no "use server") — the fixed option lists for
// the revenue Year/Month pickers on the admin dashboard and secretary
// analytics page.

export const REVENUE_EARLIEST_YEAR = 1990

export function getYearOptions(): number[] {
  const currentYear = new Date().getFullYear()
  return Array.from({ length: currentYear - REVENUE_EARLIEST_YEAR + 1 }, (_, i) => currentYear - i)
}

export const MONTH_OPTIONS = [
  { value: 0, label: "January" }, { value: 1, label: "February" }, { value: 2, label: "March" },
  { value: 3, label: "April" }, { value: 4, label: "May" }, { value: 5, label: "June" },
  { value: 6, label: "July" }, { value: 7, label: "August" }, { value: 8, label: "September" },
  { value: 9, label: "October" }, { value: 10, label: "November" }, { value: 11, label: "December" },
]
