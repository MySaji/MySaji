import { withSentryConfig } from "@sentry/nextjs/config"

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-hosting (cPanel/Passenger, not Vercel) needs a self-contained
  // server bundle rather than relying on the platform to run `next start`
  // against the full node_modules tree. Standalone output is dramatically
  // smaller, which matters on shared hosting's file-count/disk limits.
  //
  // Skipped on Windows. The step copies node_modules by creating symlinks,
  // which Windows refuses without Developer Mode or an elevated shell, so
  // the build died at the very last step after compiling everything. Not a
  // loss: a bundle whose links were made on Windows is not deployable to a
  // Linux host anyway, so the only machine whose standalone output is worth
  // producing is the Linux one that builds for cPanel. Set
  // NEXT_STANDALONE=1 to force it on regardless.
  ...(process.platform !== "win32" || process.env.NEXT_STANDALONE === "1"
    ? { output: "standalone" }
    : {}),
  typescript: {
    ignoreBuildErrors: false,
  },
  async headers() {
    return [{ source: "/(.*)", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self)" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'self'; object-src 'none'; base-uri 'self'" },
      ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }] : []),
    ] }]
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
