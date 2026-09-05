"use client"

import { createContext, useCallback, useContext, useState, type ReactNode } from "react"
import { VerificationGateDialog } from "@/components/kyc/verification-gate-dialog"

/**
 * Makes the verification wizard reachable from anywhere without every page
 * mounting its own copy of the dialog and its own open/closed state.
 *
 * A gated action calls promptVerification() when the server refuses it, and
 * the one dialog mounted here opens over whatever the user was doing. That
 * matters more than it sounds: progressive KYC deliberately lets people get
 * deep into a flow before asking, so the ask has to arrive without navigating
 * them away from the thing they were half-way through.
 */

type VerificationPromptContextValue = {
  /** Opens the wizard. Safe to call from any client component under the provider. */
  promptVerification: () => void
}

const VerificationPromptContext = createContext<VerificationPromptContextValue | undefined>(undefined)

export function VerificationPromptProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const promptVerification = useCallback(() => setOpen(true), [])

  return (
    <VerificationPromptContext.Provider value={{ promptVerification }}>
      {children}
      <VerificationGateDialog open={open} onOpenChange={setOpen} />
    </VerificationPromptContext.Provider>
  )
}

/**
 * Returns a no-op prompt when used outside the provider rather than throwing.
 * A gated action calling this must never be the thing that crashes a page —
 * the server guard has already refused the action and the caller still shows
 * its own error message, so the worst case here is that the wizard does not
 * open, not a blank screen.
 */
export function useVerificationPrompt(): VerificationPromptContextValue {
  const ctx = useContext(VerificationPromptContext)
  return ctx ?? { promptVerification: () => {} }
}
