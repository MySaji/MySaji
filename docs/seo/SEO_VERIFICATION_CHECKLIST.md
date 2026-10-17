# Deployment acceptance checklist

Run against the approved deployment and real draft container; no box below implies it has already passed. See QA_RESULTS.md for executed checks.

- [ ] Install the locked dependencies on supported Node, then run pnpm typecheck, pnpm lint, pnpm test and pnpm build. Provide a disposable local PostGIS database for the wallet integration test.
- [ ] Run existing Playwright public navigation/mobile tests against the running server; verify knowledge search and auth entry links. Perform authenticated login/MFA/dashboard/API smoke tests with authorized test accounts.
- [ ] GET /sitemap.xml: 200, XML content type, valid urlset namespace, no duplicate URLs, https://mysaji.com origin, only real public routes; no credentials or tokens.
- [ ] GET /robots.txt: 200 text, User-agent: *, Allow: /, Disallow: /api/, Sitemap: https://mysaji.com/sitemap.xml. Repeat with Googlebot and Bingbot. Confirm maintenance exemption behavior.
- [ ] Inspect rendered metadata for /, /knowledge, a guide, /privacy, /terms and a real /p/slug: unique title/description, correct canonical, Open Graph and Twitter images; no noindex.
- [ ] Inspect /auth/login, account dashboards, team-login, verify, till, POS and unknown guide: noindex or access denial; no inherited homepage canonical. Existing route-specific metadata must not override noindex.
- [ ] Check icon URLs/manifest and homepage JSON-LD. Validate with Google's Rich Results Test or schema validator (WebSite does not guarantee a rich result).
- [ ] Blank or malformed GTM ID: no GTM/GA4/Clarity request. With real test container: no requests before consent, after rejection, on private/legal/storefront pages or initial query/fragment URLs.
- [ ] Accept: exactly one container and one GA4 page_view per pathname. Navigate guide -> guide -> back: one each; no duplicate history/auto-pageview tags. Search: one settled event, result count only; no free text.
- [ ] Test withdrawal, refresh, localStorage failure, mobile buttons and private-route navigation via links, browser history and programmatic actions. Inspect all network payloads for PII, full queries, referrers, IDs and form data.
- [ ] Test optional Clarity's Strict masking, Consent Mode V2 and document boundary; leave disabled if any private route is recorded. Verify no duplicate account-side installations.
- [ ] Confirm staging is access-restricted/noindex; production preferred-domain redirects work. No contradictory hosting X-Robots-Tag on public production HTML.
- [ ] Run mobile Lighthouse with fixed throttling and cache settings; record LCP/CLS/TBT, image and script audits. Field INP requires real user data. Confirm mobile overflow/navigation and collect CWV at 75th percentile after sufficient traffic.
- [ ] Owner verifies Search Console Domain property via TXT, submits sitemap, imports Bing, validates GA4 DebugView and publishes approved GTM version. Review privacy disclosures and external monitoring/Cloudflare settings.
