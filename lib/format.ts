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

function formatClockTime(time: string): string | null {
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
export function getNextOpeningLabel(openingTime: string | null, closingTime: string | null): string | null {
  if (!openingTime || !closingTime) return null
  const [openH, openM] = openingTime.split(":").map(Number)
  if ([openH, openM].some(Number.isNaN)) return null
  const open = formatClockTime(openingTime)
  if (!open) return null
  const now = new Date()
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const openMinutes = openH * 60 + openM
  // Whether the next opening falls later today or tomorrow holds for both
  // normal (e.g. 9-18) and overnight-wrapping (e.g. 20-02) hours alike: the
  // closed window always ends at `openMinutes`, whichever side of midnight
  // it falls on, so "now < openMinutes" is the whole rule.
  return nowMinutes < openMinutes ? `Today at ${open}` : `Tomorrow at ${open}`
}
