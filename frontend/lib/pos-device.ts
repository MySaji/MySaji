/**
 * This device's own identity, as far as the till is concerned.
 *
 * Minted here, in the browser, once — the server never issues it and never
 * learns it, only its SHA-256. That is deliberate: it means a device can be
 * recognised across sessions and across logins without the shop having to
 * pair anything, and a dump of the devices table identifies nobody.
 *
 * Kept in localStorage rather than IndexedDB because it must survive the
 * outbox being cleared, and because losing it is harmless: the till simply
 * registers as a new counter, and the shopkeeper renames or revokes the old
 * row. Nothing is lost but a name.
 */

const KEY = "saji.till.device"

function mint(): string {
  // crypto.randomUUID twice: 256 bits of browser-grade randomness, with no
  // dependency and no fallback worth maintaining. Every browser that can run
  // this till has it.
  const c = globalThis.crypto
  if (c?.randomUUID) return c.randomUUID() + c.randomUUID()
  // Last resort, for a context without the Web Crypto API. Weaker, and only
  // ever used for a label, never for a secret that guards anything.
  return "fallback-" + Math.random().toString(36).slice(2) + Date.now().toString(36) + Math.random().toString(36).slice(2)
}

/**
 * The secret for this browser, minting one on first use.
 *
 * Returns null where storage is unavailable (a locked-down private window).
 * The till then sells without naming a device, which is the right answer:
 * refusing to sell because a counter could not be labelled would be absurd.
 */
export function getDeviceSecret(): string | null {
  try {
    const existing = localStorage.getItem(KEY)
    if (existing && existing.length >= 16) return existing
    const fresh = mint()
    localStorage.setItem(KEY, fresh)
    return fresh
  } catch {
    return null
  }
}

/** A first guess at a name, so the devices list is not three rows of "This device". */
export function guessDeviceName(): string {
  if (typeof navigator === "undefined") return "This device"
  const ua = navigator.userAgent
  if (/iPad/i.test(ua)) return "iPad"
  if (/iPhone/i.test(ua)) return "iPhone"
  if (/Android/i.test(ua)) return /Mobile/i.test(ua) ? "Android phone" : "Android tablet"
  if (/Windows/i.test(ua)) return "Windows computer"
  if (/Macintosh/i.test(ua)) return "Mac"
  return "This device"
}

export function guessPlatform(): string {
  if (typeof navigator === "undefined") return "web"
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios"
  if (/Android/i.test(ua)) return "android"
  if (/Windows/i.test(ua)) return "windows"
  if (/Macintosh/i.test(ua)) return "mac"
  return "web"
}
