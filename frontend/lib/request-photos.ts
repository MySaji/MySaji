/**
 * Limits and browser hand-off for photos attached to a customer request.
 *
 * The limits live here, not beside createCustomerRequest, because that file
 * carries "use server": a `use server` module may export nothing but async
 * functions, and a single exported const silently strips every export from
 * the module for client importers. The composer needs the cap to render, so
 * it has to come from a plain module both sides can import.
 */

/** How many photos one request may carry. */
export const MAX_PHOTOS = 4

/** ~1.5MB of base64, roughly what compressImageToDataUrl produces from a
 *  phone camera shot at its 1280px / q0.8 settings. These land in a Postgres
 *  column rather than object storage, so the ceiling is deliberate. */
export const MAX_PHOTO_CHARS = 2_000_000

/**
 * Hand-off for the camera buttons on the customer home screen.
 *
 * The home search bar and the "Solve a problem" card both let a customer
 * photograph the thing they need help with, but neither posts the request —
 * that happens in the composer on /customer/requests. A compressed photo is
 * far too large for a query string, so it is parked in sessionStorage for the
 * one navigation and read back out exactly once.
 *
 * sessionStorage rather than localStorage so an abandoned capture does not
 * follow the customer around forever, and every access is guarded: Safari
 * private mode throws on write rather than returning null.
 */
const KEY = "saji:pending-request-photo"

export function stashPendingRequestPhoto(dataUrl: string): boolean {
  try {
    sessionStorage.setItem(KEY, dataUrl)
    return true
  } catch {
    return false
  }
}

/** Returns the stashed photo and clears it, so a back-navigation to the
 *  composer does not silently re-attach the same picture. */
export function takePendingRequestPhoto(): string | null {
  try {
    const value = sessionStorage.getItem(KEY)
    if (value) sessionStorage.removeItem(KEY)
    return value
  } catch {
    return null
  }
}
