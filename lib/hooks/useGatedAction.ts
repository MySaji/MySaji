"use client"

import { useCallback } from "react"
// From verification-capabilities, not verification-gate: the guard imports
// `auth` and Prisma, which cannot be bundled for the browser.
import { VERIFICATION_REQUIRED_MESSAGE } from "@/lib/verification-capabilities"
import { useVerificationPrompt } from "@/lib/verification-prompt-context"

/** The shape every gated server action already returns on failure. Kept
 *  structural rather than importing each action's own result type, so one
 *  helper serves all of them. */
type ActionResult = { success: boolean; error?: string } | null | undefined

/**
 * Turns a server-side verification refusal into the wizard opening.
 *
 * The server guard (lib/verification-gate.ts) refuses a restricted action and
 * hands back VERIFICATION_REQUIRED_MESSAGE. Without this, the user reads that
 * message and is left with nowhere to go — the whole point of asking at the
 * moment of the action is that the answer is one click away.
 *
 * Matching on the message rather than a machine-readable flag is deliberate:
 * every gated action already returns `{ success: false, error }`, and adding a
 * discriminator would mean changing 26 call sites and their result types for
 * something a single shared constant already pins down. The constant is
 * exported from one place and never inlined, so the two sides cannot drift.
 */
export function useGatedAction() {
  const { promptVerification } = useVerificationPrompt()

  /**
   * Call with a failed action result. Returns true if this was a verification
   * block — in which case the wizard is now open and the caller should *not*
   * also show its own error, since the dialog says it better. Returns false
   * for every other failure, which the caller handles as it always did.
   */
  const handleGateFailure = useCallback(
    (result: ActionResult): boolean => {
      if (result && result.success === false && result.error === VERIFICATION_REQUIRED_MESSAGE) {
        promptVerification()
        return true
      }
      return false
    },
    [promptVerification],
  )

  return { handleGateFailure }
}
