# Repository audit — 2026-10-17 (before implementation)

- Next.js 16.4.1, React 19.3.1, App Router; pnpm 11.15.1. No dependency upgrades planned.
- Clean main branch; origin https://github.com/MySaji/MySaji.git. GitHub CLI unavailable.
- Root layout loads Vercel Analytics globally. No direct GA4, GTM, Search Console verification, Clarity or Cloudflare beacon found in application code. Remove the unconditional analytics component when introducing consent-gated GTM.
- Optional Sentry browser/server/edge DSNs exist; tracing samples at 100%. No session replay configured.
- Root metadata is generic SAJI marketplace metadata; knowledge guides and provider storefronts have basic titles/descriptions. No sitemap or robots routes. Till entrance already has noindex.
- Existing public content: homepage, knowledge index and static guides, privacy/terms, provider storefronts. Dashboards, authentication, POS, till and verification routes require noindex. Provider slugs need a reviewed publication/discovery policy before sitemap enumeration.
- Existing icon.jpeg and PNG application icons are the brand logo; BrandLogo supports an admin override. Preserve these assets.
- next.config.mjs uses standalone on Linux, Sentry wrapper, security headers, globally unoptimized images. Proxy checks maintenance state via backend; preserve auth and maintenance behavior.
- Existing checks: typecheck, ESLint, Node tests, Playwright public navigation/mobile tests, production build; CI provides PostGIS. Backend uses Prisma/NextAuth today; do not modify planned Django architecture.
- No attached Search & Analytics Setup Runbook was available in the conversation filesystem search. Cloudflare account/DNS and external container configuration cannot be inspected locally.

Implementation decisions: use built-in next/script afterInteractive (no dependency addition), basic consent with denied defaults and no GTM request until opt-in; full document navigation when leaving tracked public pages prevents an already-loaded container observing private SPA routes. Only knowledge search is instrumented initially, with result count and no free-text query. Dynamic provider pages remain indexable with their own canonical but excluded from tracking and sitemap until safe enumeration is approved.

Follow-up audit: package.json declares Next 16.4.1 but installed node_modules runs 16.0.10. ESLint and Playwright are missing; generated Prisma client is stale (settledAt missing). /pos is a real public introduction and receives metadata/sitemap coverage; /pos/contact includes placeholder contact data and stays noindex pending owner review.
