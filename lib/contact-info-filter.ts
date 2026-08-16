// Gap 3 (off-platform payment leakage) — masks phone numbers and email
// addresses in chat text before a Message is ever stored, so a customer
// and provider can't quietly swap contact details to arrange a cash job
// outside Saji (this app's real in-app voice calling, see
// lib/actions/calls.ts, is the sanctioned alternative). Pattern-based, not
// a cryptographic guarantee — a deliberate deterrent, same spirit as the
// KYC dedupe check elsewhere in this app, not a claim of perfect coverage.

// 9+ digits (with optional spaces/dashes/parens/leading +) comfortably
// covers Kenyan phone numbers (10 digits with a leading 0, or 12-13 with
// the country code) while staying above almost every ordinary KES amount
// someone would type in casual chat — real pricing happens through
// Quote/Invoice/booking flows, not raw chat text.
const PHONE_PATTERN = /(\+?[\d][\d\s\-().]{7,}\d)/g
const MIN_PHONE_DIGITS = 9

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g

export function maskContactInfo(text: string): { masked: string; wasMasked: boolean } {
  let wasMasked = false

  let masked = text.replace(PHONE_PATTERN, (match) => {
    const digitCount = (match.match(/\d/g) ?? []).length
    if (digitCount < MIN_PHONE_DIGITS) return match
    wasMasked = true
    return "•".repeat(match.trim().length)
  })

  masked = masked.replace(EMAIL_PATTERN, () => {
    wasMasked = true
    return "•••@•••"
  })

  return { masked, wasMasked }
}
