import Anthropic from "@anthropic-ai/sdk"
import { ApiError as GeminiApiError } from "@google/genai"

/**
 * Whether each AI provider is actually usable — shared by chatbot.ts,
 * offer-extraction.ts and offer-enhancement.ts, which all try Gemini first
 * (real free tier via Google AI Studio) and fall back to Anthropic if
 * Gemini is unconfigured, rejected, or fails.
 *
 * Each provider used to be asked only `Boolean(process.env.X_API_KEY)`,
 * which answers "is a value set", not "does it work". The difference matters
 * because the two failures deserve opposite messages:
 *
 *   - no key      -> "not set up yet"        (honest; nothing to retry)
 *   - bad key     -> "try again in a moment" (invites a retry that will fail
 *                                             identically, forever)
 *   - real outage -> "try again in a moment" (correct; retrying may work)
 *
 * A rejected credential is closer to "not configured" than to "temporarily
 * unavailable", so once a provider's API tells us its key is bad we latch
 * that and stop pretending otherwise — which also stops every subsequent
 * message making a doomed billable/quota-consuming request to that provider.
 *
 * The latch is module state, so it clears on restart: redeploying with a
 * corrected key gets a clean slate without anyone having to reset anything.
 */

let anthropicRejected = false
let geminiRejected = false

/** True when an Anthropic key is present and has not been rejected by the API. */
export function isAnthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY) && !anthropicRejected
}

/** True when a Gemini key is present and has not been rejected by the API. */
export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY) && !geminiRejected
}

/** True when at least one provider is usable — the two AI-call sites' outer
 * "should I even try" gate, before picking which provider to try first. */
export function isAnyAiConfigured(): boolean {
  return isGeminiConfigured() || isAnthropicConfigured()
}

/** True once the Anthropic API has told us the key is invalid or not permitted. */
export function isAnthropicCredentialRejected(): boolean {
  return anthropicRejected
}

/** True once the Gemini API has told us the key is invalid or not permitted. */
export function isGeminiCredentialRejected(): boolean {
  return geminiRejected
}

/**
 * Call from the catch block around any Anthropic request. Returns true if the
 * failure was the credential itself, so the caller can report "not configured"
 * rather than "try again".
 *
 * 401 and 403 both mean no amount of retrying helps: the key is wrong, or it
 * is not allowed to do this. Everything else — rate limits, timeouts, 5xx — is
 * left alone, because those genuinely are worth retrying (or, here, worth
 * falling back to the other provider for).
 */
export function noteAnthropicFailure(error: unknown): boolean {
  const isAuthFailure =
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError

  if (isAuthFailure) {
    if (!anthropicRejected) {
      // Logged once, not per request — this is an operator problem and the
      // signal should be findable without drowning the logs.
      console.error(
        "[ai] ANTHROPIC_API_KEY was rejected by the API. Anthropic will report " +
          "itself as not configured until the key is fixed and the app restarted.",
      )
    }
    anthropicRejected = true
  }

  return isAuthFailure
}

/**
 * Call from the catch block around any Gemini request. Same shape as
 * noteAnthropicFailure. Gemini's SDK reports auth problems as a 401/403, or
 * (unusually) a 400 whose message actually says the key is invalid — a plain
 * 400 on its own is left alone, since that's just as often a malformed
 * request on our side and latching on that would falsely disable a working
 * key.
 */
export function noteGeminiFailure(error: unknown): boolean {
  const isAuthFailure =
    error instanceof GeminiApiError &&
    (error.status === 401 ||
      error.status === 403 ||
      (error.status === 400 && /api key/i.test(error.message)))

  if (isAuthFailure) {
    if (!geminiRejected) {
      console.error(
        "[ai] GEMINI_API_KEY was rejected by the API. Gemini will report " +
          "itself as not configured until the key is fixed and the app restarted.",
      )
    }
    geminiRejected = true
  }

  return isAuthFailure
}

/** Test seam — lets a restart be simulated without reloading the module. */
export function resetCredentialState(): void {
  anthropicRejected = false
  geminiRejected = false
}
