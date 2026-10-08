export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return "Just now"
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return "Yesterday"
  return `${days} day${days > 1 ? "s" : ""} ago`
}

// Shared by every shop-hours read site (customer home, shop detail, browse-all)
// so there's exactly one definition of "open" instead of several drifting copies.
// Uses the server's local time, not the shop's actual timezone — good enough for
// this display field; per-shop timezones would need a real per-shop TZ column.
/** The three trading periods a shop can keep different hours for. Mon-Sat is
 *  the base pair every shop has; the other two are optional and fall back to
 *  it when unset, so a shop that trades the same hours all week is unaffected. */
export type ShopHours = {
  openingTime: string | null
  closingTime: string | null
  sundayOpeningTime?: string | null
  sundayClosingTime?: string | null
  holidayOpeningTime?: string | null
  holidayClosingTime?: string | null
}

/**
 * Which pair applies right now.
 *
 * Public holidays are deliberately not resolved here: knowing whether today is
 * one needs a holiday calendar per country, which this app does not have.
 * Holiday hours are shown to customers as information; "open now" is decided
 * from the Sunday or Mon-Sat pair. Claiming a shop is closed for a holiday we
 * cannot actually identify would be worse than not claiming it.
 */
export function resolveShopHoursForToday(shop: ShopHours): { openingTime: string | null; closingTime: string | null } {
  return pairForDay(shop, new Date().getDay())
}

/** `day` is a JS day-of-week (0 = Sunday). */
function pairForDay(shop: ShopHours, day: number): { openingTime: string | null; closingTime: string | null } {
  if (day === 0 && shop.sundayOpeningTime && shop.sundayClosingTime) {
    return { openingTime: shop.sundayOpeningTime, closingTime: shop.sundayClosingTime }
  }
  return { openingTime: shop.openingTime, closingTime: shop.closingTime }
}

/**
 * The rows a customer sees — "Mon - Sat  7:00 AM - 9:00 PM" and so on.
 *
 * Labels are passed in already translated rather than written here: this
 * module is shared by server actions that have no translator, and the app
 * ships in English, Swahili and French, so hardcoding them here would show
 * English day names to everyone. A period the shop has not set is omitted,
 * except Sunday, which falls back to the Mon-Sat hours it actually trades.
 */
export function shopHoursRows(
  shop: ShopHours,
  labels: { weekday: string; sunday: string; holiday: string; closed: string },
): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = []
  const base = formatShopHours(shop.openingTime, shop.closingTime)
  if (base) rows.push({ label: labels.weekday, value: base })
  const sunday = formatShopHours(shop.sundayOpeningTime ?? null, shop.sundayClosingTime ?? null)
  rows.push({ label: labels.sunday, value: sunday ?? base ?? labels.closed })
  const holiday = formatShopHours(shop.holidayOpeningTime ?? null, shop.holidayClosingTime ?? null)
  if (holiday) rows.push({ label: labels.holiday, value: holiday })
  return rows
}

export function isShopCurrentlyOpen(openingTime: string | null, closingTime: string | null): boolean {
  if (!openingTime || !closingTime) return false
  const [openH, openM] = openingTime.split(":").map(Number)
  const [closeH, closeM] = closingTime.split(":").map(Number)
  if ([openH, openM, closeH, closeM].some(Number.isNaN)) return false
  const now = new Date()
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const openMinutes = openH * 60 + openM
  const closeMinutes = closeH * 60 + closeM
  // Overnight hours (e.g. 20:00-02:00) wrap past midnight.
  if (closeMinutes <= openMinutes) return nowMinutes >= openMinutes || nowMinutes <= closeMinutes
  return nowMinutes >= openMinutes && nowMinutes <= closeMinutes
}

function formatClockTime(time: string | null): string | null {
  if (!time) return null
  const [h, m] = time.split(":").map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  const period = h >= 12 ? "PM" : "AM"
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`
}

export function formatShopHours(openingTime: string | null, closingTime: string | null): string | null {
  if (!openingTime || !closingTime) return null
  const open = formatClockTime(openingTime)
  const close = formatClockTime(closingTime)
  if (!open || !close) return null
  return `${open} - ${close}`
}

/** When a shop is currently closed, tells a customer exactly when to expect
 * it to reopen — "Today at 9:00 AM" / "Tomorrow at 9:00 AM" — so an order
 * placed while closed can say when it'll actually be received instead of
 * just showing a bare CLOSED badge. Only meaningful when the shop is
 * actually closed right now; callers should gate on `!isShopCurrentlyOpen`. */
/** Takes the whole shop rather than one pair because "tomorrow" may be a
 *  different trading day to today — a shop open late on Saturday reopens on
 *  Sunday hours, and one open on Sunday reopens on its Mon-Sat hours. */
export function getNextOpeningLabel(shop: ShopHours): string | null {
  const now = new Date()
  const today = pairForDay(shop, now.getDay())
  const openMinutes = toMinutes(today.openingTime)
  if (openMinutes == null || !today.closingTime) return null

  // Whether the next opening falls later today or tomorrow holds for both
  // normal (e.g. 9-18) and overnight-wrapping (e.g. 20-02) hours alike: the
  // closed window always ends at `openMinutes`, whichever side of midnight
  // it falls on, so "now < openMinutes" is the whole rule.
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  if (nowMinutes < openMinutes) {
    const open = formatClockTime(today.openingTime)
    return open ? `Today at ${open}` : null
  }
  const tomorrow = pairForDay(shop, (now.getDay() + 1) % 7)
  const open = formatClockTime(tomorrow.openingTime)
  return open ? `Tomorrow at ${open}` : null
}

function toMinutes(time: string | null): number | null {
  if (!time) return null
  const [h, m] = time.split(":").map(Number)
  if ([h, m].some(Number.isNaN)) return null
  return h * 60 + m
}
