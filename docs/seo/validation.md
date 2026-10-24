# SEO validation evidence

Review branch: `feat/public-seo-sitelinks`, based on `a9c155a` from `main`. Checks were performed locally on Windows using Next.js 16.4.1, with Chrome for Playwright. No deployment or merge was performed.

## Results — 20 October 2026

| Check | Result |
| --- | --- |
| Full ESLint | Passed: 0 errors; 18 existing warnings in unchanged files |
| Final changed-component/browser-test ESLint | Passed: 0 errors or warnings |
| Standalone TypeScript | Passed after the final build |
| Unit/domain tests | 83 passed; 1 optional PostgreSQL integration test skipped because its dedicated test database was not configured |
| Production build | Passed: `next build --webpack`; compilation, TypeScript, page generation and build finalisation completed |
| Playwright | All 11 tests passed against the final production build |
| Sitemap HTTP audit | All 32 URLs returned 200; unique titles/descriptions, production canonicals, indexable metadata and server-rendered H1s |
| Private response checks | Sampled authentication and portal paths retain `noindex, nofollow` headers; missing pages return 404/noindex |
| Whitespace validation | `git diff --check` passed |

The repository's normal pull-request CI remains a separate remote check. Local build validation disabled telemetry and Sentry uploads; no external deployment was created.

## Reproduce

Use the repository's configured development environment without committing credentials. Run these from the feature branch:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npx.cmd next build --webpack
npx.cmd next start --port 3001
```

In another terminal, run:

```powershell
$env:SAJI_BROWSER_BASE_URL = 'http://localhost:3001'
npx.cmd playwright test
```

The local build used the existing database/auth configuration and disabled Sentry uploads and telemetry. It did not run migrations, seed records or submit URLs to Google. Webpack was selected explicitly for this local production-build check. Run the standalone typecheck after the build finishes: rebuilding `.next/types` concurrently with TypeScript can invalidate generated-file paths.

## Evidence boundaries

- [Before production](./before-production.json): public HTTP snapshot captured on 18 October 2026. The five offering paths returned 404, the sitemap had 27 URLs, and the sampled account pages lacked robots metadata.
- [After local production build](./after-local.json): sanitized status, title, description, H1, canonical, robots and structured-data evidence for every sitemap URL plus representative private and missing paths. Canonicals intentionally refer to production, although these responses were tested locally.
- Browser tests additionally verify discoverable offering content with JavaScript disabled, matching visible and structured breadcrumbs, one homepage WebSite node, all 22 guides, mobile widths of 320/390px, mobile-menu interactions, and the existing Till installation flow.
- Unit tests cover sitemap membership, offering content/link consistency, structured-data serialization and analytics privacy alongside the repository's existing domain tests.

The production snapshot and local result are different environments. These checks establish repository behaviour; they do not establish that the changes are live, indexed, selected as Google's canonical, or displayed as sitelinks. Follow the [Search Console checklist](./search-console-checklist.md) after an approved release.
