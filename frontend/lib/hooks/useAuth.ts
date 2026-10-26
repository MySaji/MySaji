"use client"

import { suspendOfflineScope } from "@/frontend/lib/pos-offline-scope"
import { useCallback } from "react"
import { useSession, signIn as nextAuthSignIn, signOut as nextAuthSignOut, getSession } from "next-auth/react"
import type { UserRole } from "@/backend/domain/types"
import type { VerificationStatus } from "@/backend/services/verification-gate"
import { clearSessionHeartbeat } from "@/frontend/lib/session-heartbeat"
import { clearDevicePushSession } from "@/frontend/lib/device-push"

export interface AuthUser {
  id: string
  name: string
  email: string
  phone: string | null
  role: UserRole
  avatar?: string | null
  kycStatus?: string
  /** Progressive KYC tier — what this account may actually do. Read it
   *  through useVerificationGate() rather than comparing it by hand, so the
   *  UI and lib/verification-gate.ts can never disagree. */
  verificationStatus: VerificationStatus
  isActive: boolean
}

export type LoginResult = { success: true; role: UserRole } | { success: false; error: string }

export function useAuth() {
  const { data: session, status, update } = useSession()

  const isLoading = status === "loading"
  const isAuthenticated = status === "authenticated"

  const user: AuthUser | null = session?.user
    ? {
        id: session.user.id,
        name: session.user.name ?? "",
        email: session.user.email ?? "",
        phone: session.user.phone,
        role: session.user.role,
        avatar: session.user.image,
        kycStatus: session.user.kycStatus,
        verificationStatus: session.user.verificationStatus ?? "basic",
        isActive: session.user.isActive,
      }
    : null

  const login = useCallback(async (identifier: string, password: string, otpProof?: string): Promise<LoginResult> => {
    // Clear before Auth.js broadcasts the new session; otherwise an old idle
    // timestamp can sign a freshly authenticated user out during getSession().
    clearSessionHeartbeat()
    const result = await nextAuthSignIn("credentials", { identifier, password, otpProof, redirect: false })
    if (!result || result.error) {
      // NextAuth splits a CredentialsSignin error into two fields: `error`
      // is always the generic "CredentialsSignin" type, `code` is the
      // specific reason set via the thrown error's own `code` property
      // (see auth.ts's RateLimitedSignInError) — the specific one lives on
      // `.code`, not `.error`.
      if (result?.code === "rate-limited") {
        return { success: false, error: "Too many login attempts for this account. Please wait a few minutes and try again." }
      }
      if (result?.code === "transient-error") {
        return { success: false, error: "We're having trouble reaching our servers right now. Please try again in a moment." }
      }
      return { success: false, error: "Invalid email/phone or password" }
    }
    // Credentials sign-in itself just succeeded (the cookie is already set),
    // so a `getSession()` failure right here is virtually always a transient
    // blip in this environment's DB pooler tripping the follow-up session
    // fetch — not a real "account failed to load" — so it's worth a couple
    // of quick retries before showing the scarier fallback error.
    let freshSession = await getSession().catch(() => null)
    for (let attempt = 0; !freshSession?.user?.role && attempt < 2; attempt++) {
      await new Promise((r) => setTimeout(r, 700))
      freshSession = await getSession().catch(() => null)
    }
    if (!freshSession?.user?.role) {
      return { success: false, error: "Signed in, but could not load your account. Please try again." }
    }
    // A fresh successful login starts a new inactivity window on this device.
    clearSessionHeartbeat()
    return { success: true, role: freshSession.user.role }
  }, [])

  const loginWithGoogle = useCallback(async (callbackUrl: string) => {
    const result = await nextAuthSignIn("google", { redirect: false, callbackUrl })
    if (!result || result.error) {
      return { success: false as const, error: "Google sign-in isn't configured yet." }
    }
    // Same stale-heartbeat guard as the credentials path above — cleared
    // here, before the caller redirects to Google and back, so the session
    // that lands back in the app isn't immediately mistaken for the same
    // abandoned tab that (maybe) brought the user to this login page.
    clearSessionHeartbeat()
    return { success: true as const, url: result.url ?? callbackUrl }
  }, [])

  const logout = useCallback(async () => {
    suspendOfflineScope()
    await Promise.race([clearDevicePushSession().catch(() => {}), new Promise(resolve => setTimeout(resolve, 3000))])
    await nextAuthSignOut({ redirect: false })
  }, [])

  // Re-runs the jwt callback's `trigger === "update"` branch (see auth.ts),
  // which re-reads the user's current role/kycStatus/phone from the DB.
  // Use this after a server action changes one of those fields (e.g. a
  // new KYC submission resetting kycStatus to "pending") so the client
  // session reflects it without waiting for the next full sign-in.
  //
  // Calling next-auth's `update()` with NO argument does NOT do this — its
  // client only POSTs (the request that actually carries `trigger: "update"`
  // to the server) when `data` is not `undefined`; with no argument it
  // silently issues a plain GET that just re-returns the existing cached
  // token, so the DB is never re-read. Passing an (arbitrary) object is
  // what makes it take the POST branch.
  const refreshSession = useCallback(async () => {
    await update({})
  }, [update])

  return { user, isLoading, isAuthenticated, login, loginWithGoogle, logout, refreshSession }
}
