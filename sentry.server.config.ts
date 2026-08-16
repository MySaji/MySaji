import * as Sentry from "@sentry/nextjs"

// Sentry.init() is a genuine no-op when `dsn` is undefined — same
// env-var-gated pattern used throughout this project for every other
// third-party integration that needs real account credentials this
// environment doesn't have (M-Pesa, Stripe, PayPal, SMTP...). Nothing here
// does anything until a real SENTRY_DSN is set.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
  enabled: Boolean(process.env.SENTRY_DSN),
})
