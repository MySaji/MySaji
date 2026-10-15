import { consumeLoginProof } from "@/backend/services/login-proof"
import NextAuth, { CredentialsSignin } from "next-auth"
import type { JWT } from "next-auth/jwt"
import Credentials from "next-auth/providers/credentials"
import Google from "next-auth/providers/google"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { cookies } from "next/headers"
import { db } from "@/backend/db"
import { verifyPassword } from "@/backend/services/password"
import { ROLE_DB_TO_APP, ROLE_APP_TO_DB } from "@/backend/services/role-map"
import { buildProviderSlug } from "@/backend/domain/provider-slug"
import { checkRateLimit } from "@/backend/services/rate-limit"

// Set by the login/signup pages (a plain non-httpOnly cookie, since it only
// ever carries "which button did they click" — the actual security decision
// below is re-derived from the database, never trusted from the cookie
// alone) right before starting the Google redirect, so the signIn callback
// below can tell which page the attempt started from once Google's callback
// comes back.
const OAUTH_INTENT_COOKIE = "oauth_intent"

// Written by the signup page beside OAUTH_INTENT_COOKIE, carrying which role
// card was chosen before the redirect to Google. Without it a Google signup
// always produced a CUSTOMER: User.role defaults to CUSTOMER and the adapter
// has no idea what the person clicked.
const OAUTH_ROLE_COOKIE = "oauth_role"

// The cookie is client-set and not httpOnly, so this list is the security
// boundary rather than a convenience. It is exactly the four cards the signup
// page offers; anything else (admin, agent, secretary, sub-admin) is ignored
// and falls back to customer, so hand-editing the cookie cannot escalate.
const SELF_SIGNUP_ROLES = ["customer", "provider", "shopkeeper", "distributor"] as const
type SelfSignupRole = (typeof SELF_SIGNUP_ROLES)[number]

function readSelfSignupRole(value: string | undefined): SelfSignupRole {
  return (SELF_SIGNUP_ROLES as readonly string[]).includes(value ?? "")
    ? (value as SelfSignupRole)
    : "customer"
}

// Which Saji Pro business types were ticked before the redirect to Google —
// the OAuth equivalent of registerUser()'s `businessTypes`. Same trust model
// as OAUTH_ROLE_COOKIE: client-set and not httpOnly, so the allowlist below
// is the security boundary. Nothing here grants access; the worst a
// hand-edited cookie achieves is showing its own account some extra pages.
const OAUTH_PRO_TYPES_COOKIE = "oauth_pro_types"

const PRO_BUSINESS_TYPE_VALUES = ["SERVICES", "PRODUCTS", "RENTALS", "FREELANCE", "TUTORING", "CONSULTING"] as const
type ProBusinessTypeValue = (typeof PRO_BUSINESS_TYPE_VALUES)[number]

function readProBusinessTypes(value: string | undefined): ProBusinessTypeValue[] {
  if (!value) return []
  const seen = new Set<ProBusinessTypeValue>()
  for (const part of value.split(",")) {
    const trimmed = part.trim().toUpperCase()
    if ((PRO_BUSINESS_TYPE_VALUES as readonly string[]).includes(trimmed)) {
      seen.add(trimmed as ProBusinessTypeValue)
    }
  }
  return Array.from(seen)
}

class RateLimitedSignInError extends CredentialsSignin {
  code = "rate-limited"
}

// Surfaced when a DB call inside authorize() throws (e.g. the pooler killing
// the connection mid-query) — distinct from RateLimitedSignInError so the
// client can tell "your account is genuinely rate-limited" apart from "we
// couldn't even reach the database" instead of showing a misleading
// "wrong password" message for an infra failure that has nothing to do with
// the password entered.
class TransientAuthError extends CredentialsSignin {
  code = "transient-error"
}

const hasGoogleCredentials = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: "jwt" },
  pages: {
    signIn: "/auth/login",
  },
  providers: [
    Credentials({
      id: "credentials",
      name: "Credentials",
      credentials: {
        identifier: { label: "Email or phone", type: "text" },
        password: { label: "Password", type: "password" },
        otpProof: { label: "Verification proof", type: "text" },
      },
      async authorize(credentials) {
        const identifier = credentials?.identifier as string | undefined
        const password = credentials?.password as string | undefined
        if (!identifier || !password) return null

        try {
          // Rate-limited by the identifier being logged into, not by IP —
          // this is what actually stops credential-guessing against one
          // account regardless of how many different source IPs it comes
          // from. Every attempt counts, not just failures, so a scripted
          // credential-stuffing run can't hide behind occasional real logins.
          const rateLimit = await checkRateLimit(`login:${identifier.trim().toLowerCase()}`, "login", 5, 15 * 60 * 1000)
          if (!rateLimit.allowed) throw new RateLimitedSignInError()

          const user = await db.user.findFirst({
            where: {
              OR: [{ email: identifier }, { phone: identifier }],
            },
          })
          // Soft-deleted accounts can never sign back in (deletedAt is set by
          // softDeleteUser and is permanent). A merely-suspended account
          // (isActive: false, deletedAt: null, set by the reversible
          // toggleSuspendUser action) is deliberately allowed to authenticate
          // — the portal layouts show a restricted "account suspended" screen
          // instead of a generic wrong-credentials error, so the user can see
          // why and reach admin support rather than being locked out blind.
          if (!user || !user.password || user.deletedAt) return null

          const valid = await verifyPassword(password, user.password)
          if (!valid) return null
          if (!(await consumeLoginProof(user.id, credentials?.otpProof))) return null

          return {
            id: user.id,
            name: user.name,
            email: user.email,
            image: user.image,
            role: user.role,
            phone: user.phone,
            kycStatus: user.kycStatus,
            verificationStatus: user.verificationStatus,
            isActive: user.isActive,
            language: user.language,
            currency: user.currency,
          }
        } catch (err) {
          // A deliberate rejection (bad password, rate-limited, etc.) never
          // reaches here — only a genuine failure to even complete the check
          // does (e.g. the DB connection getting killed mid-query). Without
          // this, that exception propagates uncaught out of the route
          // handler, which breaks the response entirely and surfaces to the
          // browser as a raw "Failed to fetch" instead of a normal, handled
          // sign-in rejection.
          if (err instanceof RateLimitedSignInError || err instanceof TransientAuthError) throw err
          console.error("[auth] credentials authorize() failed unexpectedly:", err)
          throw new TransientAuthError()
        }
      },
    }),
    ...(hasGoogleCredentials
      ? [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            // Google always verifies the email before completing OAuth, so
            // linking by email here is safe (the "dangerous" case this flag
            // is named for is providers that DON'T verify email ownership).
            // Without this, a real user can get permanently stuck: if their
            // stored Account row's providerAccountId ever stops matching
            // what Google returns for any reason, Auth.js's default
            // behavior is to refuse to re-link and throw
            // OAuthAccountNotLinked forever, with no way back in via
            // Google — this re-links (and self-heals the stored id) by
            // trusted email match instead of hard-blocking.
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),
  ],
  callbacks: {
    // Auth.js's own default behavior for OAuth is to silently create an
    // account on first sign-in and log in on every return visit, with no
    // concept of "signup" vs "login" as distinct intents — one button just
    // does whichever applies. The user explicitly wants these treated as
    // separate flows: trying to "sign up" with a Google account that's
    // already linked should fail with "already signed up, sign in instead",
    // and trying to "sign in" with one that was never linked should fail
    // with "not signed up, sign up first" — rather than the signup button
    // silently logging an existing user in, or the login button silently
    // creating a brand-new account.
    //
    // Returning false/a string here runs *before* the adapter ever touches
    // the database for a new sign-in (this is the documented purpose of the
    // signIn callback — decide whether to allow it at all), so a rejection
    // here never leaves a half-created User/Account row behind.
    async signIn({ account }) {
      if (account?.provider === "google") {
        try {
          const intent = (await cookies()).get(OAUTH_INTENT_COOKIE)?.value
          const existingAccount = await db.account.findUnique({
            where: { provider_providerAccountId: { provider: "google", providerAccountId: account.providerAccountId } },
          })
          if (intent === "signup" && existingAccount) {
            return "/auth/login?error=GoogleAccountExists"
          }
          if (intent === "login" && !existingAccount) {
            return "/auth/login?error=GoogleAccountNotFound"
          }
        } catch (err) {
          // This lookup is a UX nicety (signup-vs-login intent messaging),
          // not a security gate — the real account-linking/creation still
          // goes through the Prisma adapter below either way. A transient
          // DB hiccup (Supabase pooler drop, cold start) hitting exactly
          // this query shouldn't fail the whole sign-in with an opaque
          // "Configuration" error; log it and let the adapter's own flow
          // decide instead of hard-blocking here.
          console.error("[auth] signIn intent-check query failed, continuing without it:", err)
        }
      }
      return true
    },
    async jwt({ token: rawToken, user, trigger }) {
      // NextAuth v5 beta's inferred `token` type inside this callback
      // doesn't pick up the `next-auth/jwt` module augmentation above
      // (a known beta type-plumbing gap — every custom field resolves to
      // `unknown` here even though the augmentation works fine everywhere
      // else, e.g. `session.user.*` reads throughout the app). Same
      // `as unknown as X` escape hatch already used below for `user.role`/
      // `user.kycStatus`, applied once here instead of at every assignment.
      const token = rawToken as unknown as JWT
      if (user) {
        // The `user` handed here is the object the adapter built, which for an
        // OAuth signup is read *before* events.createUser runs. Re-reading means
        // the role assigned there lands in the very first token, instead of the
        // session claiming CUSTOMER until the next sign-in. One query, on
        // sign-in only.
        if (user.id) {
          const fresh = await db.user
            .findUnique({ where: { id: user.id }, select: { role: true, kycStatus: true, verificationStatus: true } })
            .catch(() => null)
          if (fresh) {
            user.role = fresh.role as unknown as typeof user.role
            user.kycStatus = fresh.kycStatus as unknown as typeof user.kycStatus
            user.verificationStatus = fresh.verificationStatus as unknown as typeof user.verificationStatus
          }
        }
        // `user.role` is a raw Prisma enum value ("CUSTOMER", "SUB_ADMIN", ...)
        // whether it came from the Credentials authorize() above or was
        // constructed fresh by the Prisma adapter for an OAuth sign-in.
        // Normalize once, here, so every downstream consumer (session,
        // every existing portal layout's `user.role` check) sees the
        // frontend's lowercase-hyphenated format consistently.
        const rawRole = user.role as unknown as string
        token.id = user.id!
        token.role = rawRole in ROLE_DB_TO_APP ? ROLE_DB_TO_APP[rawRole as keyof typeof ROLE_DB_TO_APP] : (rawRole as typeof token.role)
        token.phone = user.phone
        token.picture = user.image
        // Same normalization as role: Prisma's KycStatus enum is uppercase
        // ("APPROVED"), but lib/types.ts and every existing portal layout
        // check (e.g. app/agent/layout.tsx, app/provider/layout.tsx) expect
        // lowercase ("approved"). Lowercase once, here.
        token.kycStatus = (user.kycStatus as unknown as string)?.toLowerCase() as typeof token.kycStatus
        // Same lowercase normalization as role/kycStatus. Defaulted rather
        // than left undefined so a token minted for an account created
        // before this field existed still gates correctly (as "basic")
        // instead of failing every `satisfies` lookup.
        token.verificationStatus =
          ((user.verificationStatus as unknown as string)?.toLowerCase() as typeof token.verificationStatus) ?? "basic"
        token.isActive = user.isActive
        token.language = user.language ?? "en"
        token.currency = user.currency ?? "KES"
      }

      // Client called useSession().update() (see lib/hooks/useAuth.ts's
      // refreshSession) — a server action changed role/kycStatus/phone/image
      // and the client needs the new value without a full re-login. Image
      // is included here because updateProfileAvatar() only ever touches
      // the DB row — without re-reading it here, a freshly-uploaded avatar
      // would never reach the session (and the header icon beside it)
      // until the next full sign-in. Also re-reads isActive so an admin
      // suspending or reactivating a user updates their restricted-screen
      // state without forcing a fresh login.
      if (token.id) {
        const freshUser = await db.user.findUnique({ where: { id: token.id } })
        if (!freshUser || freshUser.deletedAt || !freshUser.isActive) return null
        if (freshUser) {
          const rawRole = freshUser.role as unknown as string
          token.role = rawRole in ROLE_DB_TO_APP ? ROLE_DB_TO_APP[rawRole as keyof typeof ROLE_DB_TO_APP] : (rawRole as typeof token.role)
          token.phone = freshUser.phone
          token.picture = freshUser.image
          token.kycStatus = (freshUser.kycStatus as unknown as string)?.toLowerCase() as typeof token.kycStatus
          token.verificationStatus =
            ((freshUser.verificationStatus as unknown as string)?.toLowerCase() as typeof token.verificationStatus) ?? "basic"
          token.isActive = freshUser.isActive
          token.language = freshUser.language ?? "en"
          token.currency = freshUser.currency ?? "KES"
        }
      }

      return token
    },
    async session({ session, token: rawToken }) {
      const token = rawToken as unknown as JWT
      if (session.user) {
        session.user.id = token.id
        session.user.role = token.role
        session.user.phone = token.phone
        session.user.image = token.picture
        session.user.kycStatus = token.kycStatus
        session.user.verificationStatus = token.verificationStatus ?? "basic"
        session.user.isActive = token.isActive
        session.user.language = token.language
        session.user.currency = token.currency
      }
      return session
    },
  },
  events: {
    // Only fires for adapter-created users (OAuth sign-ups). Credentials
    // sign-ups go through lib/actions/auth.ts's registerUser, which
    // provisions these rows itself in the same transaction as the User row.
    async createUser({ user }) {
      if (!user.id) return

      // Mirrors registerUser() in lib/actions/auth.ts, which does the same
      // provisioning for credentials signups. Before this, every OAuth signup
      // got role CUSTOMER and a CustomerProfile no matter which card was
      // picked — so choosing "Service Provider" and continuing with Google
      // produced a customer account with no ProviderProfile at all.
      let appRole: SelfSignupRole = "customer"
      let proTypes: ProBusinessTypeValue[] = []
      try {
        const jar = await cookies()
        appRole = readSelfSignupRole(jar.get(OAUTH_ROLE_COOKIE)?.value)
        proTypes = readProBusinessTypes(jar.get(OAUTH_PRO_TYPES_COOKIE)?.value)
      } catch {
        // No cookie means the intent is unknowable; customer is the safe
        // default because it is the least privileged of the four.
      }

      await db.user
        .update({
          where: { id: user.id },
          data: {
            role: ROLE_APP_TO_DB[appRole],
            // Under progressive KYC nobody is approved at signup — customers
            // included. `kycStatus` is now strictly the verdict on documents
            // this account actually submitted, and a fresh account has
            // submitted none; what it may *do* is `verificationStatus`, which
            // starts BASIC by schema default for every role.
            kycStatus: "PENDING",
          },
        })
        .catch(() => {})

      await db.wallet.create({ data: { userId: user.id } }).catch(() => {})

      const displayName = user.name ?? user.email ?? "SAJI user"
      try {
        if (appRole === "provider") {
          const profile = await db.providerProfile.create({ data: { userId: user.id } })
          await db.providerProfile.update({
            where: { id: profile.id },
            data: { slug: buildProviderSlug(user.name, user.email, profile.id) },
          })
          // Same provisioning registerUser() does for a credentials signup:
          // record what this Saji Pro does, and give it the ShopkeeperProfile
          // the merchant pages read from if it sells products.
          const chosen: ProBusinessTypeValue[] = proTypes.length > 0 ? proTypes : ["SERVICES"]
          await db.proCapability.createMany({
            data: chosen.map((type) => ({ userId: user.id!, type, status: "ACTIVE" as const })),
            skipDuplicates: true,
          })
          if (chosen.includes("PRODUCTS")) {
            await db.shopkeeperProfile.create({ data: { userId: user.id, shopName: displayName + "'s Shop" } })
          }
        } else if (appRole === "shopkeeper") {
          await db.shopkeeperProfile.create({ data: { userId: user.id, shopName: displayName + "'s Shop" } })
        } else if (appRole === "distributor") {
          await db.distributorProfile.create({ data: { userId: user.id, companyName: displayName + "'s Company" } })
        } else {
          await db.customerProfile.create({ data: { userId: user.id } })
        }
      } catch (err) {
        console.error("[auth] createUser profile provisioning failed:", err)
      }
    },
  },
})
