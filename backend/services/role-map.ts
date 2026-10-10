import type { Role as PrismaRole } from "@prisma/client"
import type { UserRole } from "@/backend/domain/types"

/**
 * Single translation point between Prisma's `Role` enum (DB/Postgres
 * convention: UPPER_SNAKE_CASE) and the frontend's lowercase-hyphenated
 * role strings, which are already checked throughout every portal layout
 * (e.g. `user.role === "sub-admin"`). Keeping this mapping in one place
 * means no portal layout needs to change when the backend was wired up.
 */
export const ROLE_DB_TO_APP: Record<PrismaRole, UserRole> = {
  CUSTOMER: "customer",
  PROVIDER: "provider",
  SHOPKEEPER: "shopkeeper",
  DISTRIBUTOR: "distributor",
  AGENT: "agent",
  SECRETARY: "secretary",
  SUB_ADMIN: "sub-admin",
  ADMIN: "admin",
}

export const ROLE_APP_TO_DB: Record<UserRole, PrismaRole> = {
  customer: "CUSTOMER",
  provider: "PROVIDER",
  shopkeeper: "SHOPKEEPER",
  distributor: "DISTRIBUTOR",
  agent: "AGENT",
  secretary: "SECRETARY",
  "sub-admin": "SUB_ADMIN",
  admin: "ADMIN",
}

/** Where to land a user right after a successful sign-in, by role. */
export const ROLE_HOME_PATH: Record<UserRole, string> = {
  customer: "/customer/home",
  provider: "/provider",
  shopkeeper: "/shopkeeper",
  distributor: "/distributor",
  agent: "/agent",
  secretary: "/secretary",
  "sub-admin": "/sub-admin",
  admin: "/admin",
}
