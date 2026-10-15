"use client"

import { createContext, useContext, useCallback, type ReactNode } from "react"
import { useAuth, type AuthUser, type LoginResult } from "@/frontend/lib/hooks/useAuth"
import { useRouter } from "next/navigation"
import { clearSessionHeartbeat } from "@/frontend/lib/session-heartbeat"
import { SessionGuard } from "@/frontend/components/session-guard"

interface AuthContextType {
  user: AuthUser | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (identifier: string, password: string, otpProof?: string) => Promise<LoginResult>
  loginWithGoogle: (callbackUrl: string) => Promise<{ success: true; url: string } | { success: false; error: string }>
  logout: () => void
  refreshSession: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const router = useRouter()

  const logoutWithRedirect = useCallback(() => {
    clearSessionHeartbeat()
    void auth.logout().then(() => router.push("/"))
  }, [auth, router])

  const contextValue: AuthContextType = {
    ...auth,
    logout: logoutWithRedirect,
  }

  return (
    <AuthContext.Provider value={contextValue}>
      <SessionGuard />
      {children}
    </AuthContext.Provider>
  )
}

export function useAuthContext() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuthContext must be used within AuthProvider")
  }
  return context
}
