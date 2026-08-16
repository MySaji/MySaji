import * as Sentry from "@sentry/nextjs"

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config")
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config")
  }
}

// Safe to reference even when SENTRY_DSN is unset — Sentry.init() above is
// never called with a real DSN in that case, so this becomes a no-op
// rather than an error.
export const onRequestError = Sentry.captureRequestError
