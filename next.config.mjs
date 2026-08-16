import { withSentryConfig } from "@sentry/nextjs"

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-hosting (cPanel/Passenger, not Vercel) needs a self-contained
  // server bundle rather than relying on the platform to run `next start`
  // against the full node_modules tree — standalone output is dramatically
  // smaller, which matters on shared hosting's file-count/disk limits.
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  experimental: {
    // Several server actions (shopkeeper/provider registration, KYC
    // submission) accept base64 data URLs for photo uploads — real
    // phone-camera photos routinely exceed Next's default 1MB limit,
    // which otherwise fails the request silently from the UI's perspective.
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
}

// withSentryConfig itself is safe to apply even without SENTRY_DSN/org/project
// set — it just skips source-map upload (silenced here) until those are
// configured, same env-gated pattern as the rest of the Sentry scaffolding.
export default withSentryConfig(nextConfig, {
  silent: true,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
})
