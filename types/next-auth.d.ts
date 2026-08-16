import type { DefaultSession } from "next-auth"
import type { UserRole } from "@/lib/types"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: UserRole
      phone: string | null
      kycStatus: string
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
    isActive: boolean
    language: string
    currency: string
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string
    role: UserRole
    phone: string | null
    kycStatus: string
    isActive: boolean
    language: string
    currency: string
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string
    role: UserRole
    phone: string | null
    kycStatus: string
    isActive: boolean
    language: string
    currency: string
  }
}
