import * as Sentry from "@sentry/nextjs"

// Browser-side init — same env-gated pattern as the server/edge configs.
// NEXT_PUBLIC_ prefix is required since this file ships to the client.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1.0,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
