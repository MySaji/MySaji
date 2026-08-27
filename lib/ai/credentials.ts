import Anthropic from "@anthropic-ai/sdk"

/**
 * Whether the Anthropic integration is actually usable — shared by
 * chatbot.ts, offer-extraction.ts and offer-enhancement.ts.
 *
 * Each of those used to ask only `Boolean(process.env.ANTHROPIC_API_KEY)`,
 * which answers "is a value set", not "does it work". The difference matters
 * because the two failures deserve opposite messages:
 *
 *   - no key      -> "not set up yet"        (honest; nothing to retry)
 *   - bad key     -> "try again in a moment" (invites a retry that will fail
 *                                             identically, forever)
 *   - real outage -> "try again in a moment" (correct; retrying may work)
 *
 * A rejected credential is closer to "not configured" than to "temporarily
 * unavailable", so once the API tells us the key is bad we latch that and stop
 * pretending otherwise — which also stops every subsequent message making a
 * doomed billable request.
 *
 * The latch is module state, so it clears on restart: redeploying with a
 * corrected key gets a clean slate without anyone having to reset anything.
 */

let credentialRejected = false

/** True when a key is present and has not been rejected by the API. */
export function isConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY) && !credentialRejected
}

/** True once the API has told us the key is invalid or not permitted. */
export function isCredentialRejected(): boolean {
  return credentialRejected
}

/**
 * Call from the catch block around any Anthropic request. Returns true if the
 * failure was the credential itself, so the caller can report "not configured"
 * rather than "try again".
 *
 * 401 and 403 both mean no amount of retrying helps: the key is wrong, or it
 * is not allowed to do this. Everything else — rate limits, timeouts, 5xx — is
 * left alone, because those genuinely are worth retrying.
 */
export function noteAnthropicFailure(error: unknown): boolean {
  const isAuthFailure =
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError

  if (isAuthFailure) {
    if (!credentialRejected) {
      // Logged once, not per request — this is an operator problem and the
      // signal should be findable without drowning the logs.
      console.error(
        "[ai] ANTHROPIC_API_KEY was rejected by the API. AI features will report " +
          "themselves as not configured until the key is fixed and the app restarted.",
      )
    }
    credentialRejected = true
  }

  return isAuthFailure
}

/** Test seam — lets a restart be simulated without reloading the module. */
export function resetCredentialState(): void {
  credentialRejected = false
}
