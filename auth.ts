import NextAuth, { CredentialsSignin } from "next-auth"
import type { JWT } from "next-auth/jwt"
import Credentials from "next-auth/providers/credentials"
import Google from "next-auth/providers/google"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { cookies } from "next/headers"
import { db } from "@/lib/db"
import { verifyPassword } from "@/lib/password"
import { ROLE_DB_TO_APP } from "@/lib/role-map"
import { checkRateLimit } from "@/lib/rate-limit"

// Set by the login/signup pages (a plain non-httpOnly cookie, since it only
// ever carries "which button did they click" — the actual security decision
// below is re-derived from the database, never trusted from the cookie
// alone) right before starting the Google redirect, so the signIn callback
// below can tell which page the attempt started from once Google's callback
// comes back.
const OAUTH_INTENT_COOKIE = "oauth_intent"

class RateLimitedSignInError extends CredentialsSignin {
  code = "rate-limited"
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
      },
      async authorize(credentials) {
        const identifier = credentials?.identifier as string | undefined
        const password = credentials?.password as string | undefined
        if (!identifier || !password) return null

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

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          role: user.role,
          phone: user.phone,
          kycStatus: user.kycStatus,
          isActive: user.isActive,
          language: user.language,
          currency: user.currency,
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
      if (trigger === "update" && token.id) {
        const freshUser = await db.user.findUnique({ where: { id: token.id } })
        if (freshUser) {
          const rawRole = freshUser.role as unknown as string
          token.role = rawRole in ROLE_DB_TO_APP ? ROLE_DB_TO_APP[rawRole as keyof typeof ROLE_DB_TO_APP] : (rawRole as typeof token.role)
          token.phone = freshUser.phone
          token.picture = freshUser.image
          token.kycStatus = (freshUser.kycStatus as unknown as string)?.toLowerCase() as typeof token.kycStatus
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
      await db.wallet.create({ data: { userId: user.id } }).catch(() => {})
      await db.customerProfile.create({ data: { userId: user.id } }).catch(() => {})
    },
  },
})
