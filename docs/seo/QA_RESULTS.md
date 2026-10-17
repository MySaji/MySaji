# Executed QA — 2026-10-17

## Passed

- `node --test tests/*.test.cjs`: 12 passed, 0 failed; 1 PostgreSQL wallet integration test skipped because SAJI_TEST_DATABASE_URL is absent. Includes existing payment/MFA/credentials/POS isolation tests and new metadata, sitemap, robots and analytics privacy tests.
- Before upstream reconciliation, actual dev-server GET /sitemap.xml: HTTP 200, application/xml. PowerShell XML parsing verified the namespace and 19 unique production URLs. After incorporating upstream's eight additional guides, unit validation confirms 27 unique URLs (22 guides plus homepage, knowledge index, privacy, terms and /pos); the final 27-URL HTTP response remains unverified because the stale installation cannot load upstream's Sentry configuration.
- Actual GET /robots.txt: HTTP 200, text/plain, wildcard allow, /api/ disallow and correct sitemap. Repeated successfully with Googlebot and bingbot user agents.
- `git diff --check`: passed.
- Static source review: existing logo/icons preserved; no direct GA4/Clarity installer; Vercel analytics mount removed; environment-gated container; no free-text search payload. Metadata unit checks confirm index/canonical/social alignment.

## Failed or blocked — not claimed passed

- `pnpm typecheck`, `pnpm lint`, `pnpm test`: pnpm tried to refresh mismatched dependencies; registry fetch failed and noninteractive module-purge confirmation stopped it. No lockfile/dependency change was made.
- Direct TypeScript: errors in existing payment-settlement/wallet-payment because generated Prisma types lack settledAt, plus missing @playwright/test and resulting test typing errors. No diagnostics in changed implementation files. Regenerate Prisma and install locked dependencies before acceptance.
- Direct ESLint: MODULE_NOT_FOUND; eslint is declared but absent from node_modules.
- Production build: installed Next is 16.0.10 although package.json declares 16.4.1. Google Fonts fetch fails with network/TLS connection errors. Existing Sentry dependencies also warn about import-in-the-middle/require-in-the-middle resolution. Unused Geist Mono was subsequently removed as safe cleanup; Geist still needs the blocked fetch. Build has not passed.
- After preserving current main, dev startup additionally fails because its @sentry/nextjs/config import requires the newer declared Sentry version; the installed stale package does not export that path. No upstream package/config change was reverted to hide this installation problem.
- Playwright is absent. Homepage HTTP render fails at the existing maintenance-proxy database lookup because DATABASE_URL is absent. No authorized test accounts or disposable database available. Authentication/dashboard/API browser smoke tests remain unverified; existing security unit tests pass.
- Lighthouse and mobile runtime measurements are blocked by the unavailable rendered application and missing browser tooling. INP requires field traffic; no performance scores or improvements are claimed. Existing largest public PNGs are 917245, 886399, 880043 and 706299 bytes (appliance repair, cleaning, electrical and software illustrations). Compression/format migration and the existing disabled global image optimization need separate validation. Homepage illustration priority and unused-font removal are implemented without claiming measured CWV gains.
- Real GA4/Tag Assistant, Clarity recordings, Cloudflare DNS/injection, Search Console/Bing indexing require owner accounts, identifiers and approved deployment. External integrations are not live.
- The referenced runbook attachment was unavailable.
- Git HTTPS cannot reach github.com:443 in this sandbox. GitHub connector access is available; delivery can use that connector without merging or deploying.

## Reproduction after environment repair

Install locked dependencies on supported Node, regenerate Prisma, configure a disposable local PostGIS database and test AUTH_SECRET using existing deployment docs. Run typecheck/lint/test/build and Playwright against the running app. Never use production data for tests. Complete the deployment acceptance checklist and attach mobile Lighthouse/Tag Assistant evidence before enabling the real container. No authentication/API/backend contracts were intentionally changed.

## Upstream reconciliation

GitHub main had advanced two commits beyond the local starting point. Its changes were preserved, including eight additional guides, security tests and environment settings. The only text conflict was the knowledge-search React import; retained upstream hydration readiness plus analytics hooks. The Node suite was rerun after reconciliation: 12 passed, 1 database test skipped. No dependency upgrades were introduced by this SEO change; package/lockfile updates belong to the incorporated upstream commits. The upstream AGENTS.md references bundled Next documentation that is absent from the stale local installation; official Next documentation was consulted instead.
