import { db } from "@/backend/db"
import { headers } from "next/headers"

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number }

/** Real, DB-backed sliding-window rate limit — not in-memory, since a
 * production deployment runs multiple serverless instances that don't
 * share memory. Always records this attempt (success or failure is the
 * caller's business); the caller decides what "identifier" and "action"
 * mean for its own case. */
export async function checkRateLimit(identifier: string, action: string, maxAttempts: number, windowMs: number): Promise<RateLimitResult> {
  return db.$transaction(async tx => {
    // Serialize only this bucket across all application instances.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${action}), hashtext(${identifier}))`
    const windowStart = new Date(Date.now() - windowMs)
    const recentAttempts = await tx.rateLimitAttempt.findMany({
      where: { identifier, action, createdAt: { gte: windowStart } },
      orderBy: { createdAt: "asc" }, select: { createdAt: true }, take: maxAttempts,
    })
    if (recentAttempts.length >= maxAttempts) return { allowed: false as const, retryAfterSeconds: Math.max(1, Math.ceil((recentAttempts[0].createdAt.getTime() + windowMs - Date.now()) / 1000)) }
    await tx.rateLimitAttempt.create({ data: { identifier, action } })
    return { allowed: true as const }
  })
}

/** Best-effort client IP for rate-limiting signups (where the identifier —
 * a fresh email — is different every time, so per-account limiting alone
 * wouldn't stop a scripted mass-signup). `x-forwarded-for` is set by
 * Vercel/most reverse proxies in production; falls back to a constant in
 * local dev where it's absent, which just means dev-mode signups all share
 * one bucket — fine, since this path only matters once deployed. */
export async function getClientIp(): Promise<string> {
  const h = await headers()
  if (process.env.TRUST_PROXY_HEADERS !== "true") return "shared-untrusted-proxy"
  const forwardedFor = h.get("x-forwarded-for")
  if (forwardedFor) return forwardedFor.split(",")[0].trim()
  return h.get("x-real-ip") ?? "unknown"
}
