/**
 * Storefront addresses (/p/<slug>).
 *
 * One implementation, used by the three places a ProviderProfile is created
 * (signup, account-switch, staff-invite acceptance) and by the backfill script
 * — so a provider's address is the same whichever path made their profile.
 *
 * Unicode letters, digits and combining marks all survive. SAJI is meant to
 * carry providers globally, and an ASCII-only rule turns every name written in
 * a non-Latin script into the same anonymous fallback. Combining marks matter
 * as much as letters: they carry the vowels and the virama in Devanagari,
 * Thai and Arabic, so dropping them misspells a name rather than
 * transliterating it ("शर्मा" would become "शर-म"). Non-ASCII path segments are
 * percent-encoded on the wire and displayed decoded, which every current
 * browser and Next.js route matching handle.
 */

function clean(value: string): string {
  return value
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
}

/**
 * Builds a candidate slug. The id suffix is what makes it unique without a
 * retry loop — two providers called "John Doe" is ordinary, and a
 * check-then-insert loop is a race under concurrency.
 *
 * Falls through the candidates because a name of only emoji cleans to nothing,
 * and the email local part identifies someone far better than "provider".
 */
export function buildProviderSlug(
  displayName: string | null | undefined,
  email: string | null | undefined,
  profileId: string,
): string {
  const base =
    clean(String(displayName ?? "").trim()) ||
    clean(String(email ?? "").trim().split("@")[0]) ||
    "provider"

  return `${base}-${profileId.slice(-6)}`
}
