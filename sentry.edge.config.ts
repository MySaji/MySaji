import * as Sentry from "@sentry/nextjs"

// Same env-gated pattern as sentry.server.config.ts, for code running on
// the Edge runtime (middleware, edge API routes).
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
  enabled: Boolean(process.env.SENTRY_DSN),
})
