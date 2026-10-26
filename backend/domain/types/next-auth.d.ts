import type { DefaultSession } from "next-auth"
import type { UserRole } from "@/backend/domain/types"
import type { VerificationStatus } from "@/backend/domain/verification-capabilities"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: UserRole
      phone: string | null
      kycStatus: string
      verificationStatus: VerificationStatus
      isActive: boolean
      language: string
      currency: string
    } & DefaultSession["user"]
  }

  interface User {
    // Loosely typed: may be a raw Prisma `Role` enum value (OAuth/adapter
    // path) or an already-mapped `UserRole` (Credentials path), normalized
    // to `UserRole` by the `jwt` callback in auth.ts before it reaches JWT/Session.
    role: string
    phone: string | null
    kycStatus: string
    // Same loose typing as `role`/`kycStatus` above and for the same reason:
    // on the Credentials path this is still the raw Prisma enum ("BASIC"),
    // and the `jwt` callback in auth.ts lowercases it before it reaches
    // JWT/Session — which do use the strict union.
    verificationStatus: string
    isActive: boolean
    language: string
    currency: string
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    sessionStartedAt?: number
    lastActivityAt?: number
    id: string
    role: UserRole
    phone: string | null
    kycStatus: string
    verificationStatus: VerificationStatus
    isActive: boolean
    language: string
    currency: string
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    sessionStartedAt?: number
    lastActivityAt?: number
    id: string
    role: UserRole
    phone: string | null
    kycStatus: string
    verificationStatus: VerificationStatus
    isActive: boolean
    language: string
    currency: string
  }
}
