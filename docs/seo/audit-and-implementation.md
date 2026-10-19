# MySaji public SEO audit and implementation

Initial audit base: `224a709e63b3f47436ae58788b0c04bb3b073606`. Rebased onto `a9c155a` (`origin/main`) on 20 October 2026, preserving the subsequent portal changes. Review branch: `feat/public-seo-sitelinks`. Production domain: `https://mysaji.com`.

This work was isolated from the main workspace’s uncommitted portal changes. It does not deploy, merge, change DNS, submit Search Console requests or certify that Google will select sitelinks. Google automatically selects sitelinks based on the query and the site; site owners cannot force them.

## Evidence before the change

The production HTTP audit is saved in [before-production.json](./before-production.json), captured on 18 October 2026. It contains public status/metadata evidence, not cookies or signed-in account data.

| Area | Before | Repository change |
| --- | --- | --- |
| Main offerings | `/shop`, `/work`, `/rent`, `/grow` and `/pro` returned 404 | Five dedicated public server-rendered overviews with distinct H1s, titles, descriptions and workflows |
| Learn | Existing `/knowledge` hub and 22 substantive guides | Keep this canonical hub; navigation labels it Learn / help & guides rather than creating duplicate course or learning pages |
| Public navigation | Homepage links often led directly to account actions or handbook articles; desktop guides navigation used a different header | Shared offering hierarchy in homepage cards, desktop dropdown, mobile menu and footer; guides and offerings share a public header |
| Homepage | Descriptive metadata, but a generic “Good people. Useful skills. Things done.” H1 | H1 identifies shopping, services, business tools and MySaji; retain the original product-led design |
| Brand | MySaji, SAJI and unbranded titles mixed across metadata/footer | MySaji is the preferred site name; Saji Pro and Saji Till remain product names; titles/social metadata are consistently branded |
| Private indexing | Production `/auth/login` and `/customer/home` returned HTML without a robots meta directive | Root noindex/nofollow default plus sensitive-route `X-Robots-Tag` headers; public pages explicitly opt in; access controls unchanged |
| Canonicals | Helper supported a deployment-dependent environment override | Public canonical origin is explicitly `https://mysaji.com`; metadataBase and absolute social image URLs agree |
| Sitemap | 27 canonical URLs: homepage, knowledge, privacy, terms, Till and 22 guides | Add the five real offering URLs: 32 static public URLs, no auth/portal paths or duplicate Learn route |
| WebSite JSON-LD | One homepage node with name, URL and slogan | Preserve one node, add stable ID and the existing SAJI brand as an alternative; safely serialize JSON-LD |
| Breadcrumbs | Guide navigation showed the knowledge category, without matching markup | Visible home → hub/offering → current-page breadcrumbs with matching `BreadcrumbList`; applied to offering pages, knowledge pages and Till |

## Navigation and content decisions

The primary hierarchy is **Shop → `/shop`**, **Work → `/work`**, **Rent → `/rent`**, **Learn → `/knowledge`**, **Grow → `/grow`**, **Saji Pro → `/pro`**, **Saji Till → `/pos`**. Product overviews link to relevant help articles and related public offerings. Authentication links remain useful next steps but are not indexable landing pages.

Work describes service bookings and offering professional skills, not salaried job placement. Rent describes equipment rentals, not property lettings. Learn is the implemented guides resource, not a claimed accredited course platform. Grow explains existing business tools without promising loans, grants, investment returns or guaranteed customers. Pro and Till explain their distinct workspaces. Commercial terms and live availability are confirmed in the relevant account; no fabricated prices, reviews, volumes or operational integrations are introduced.

Content was checked against `backend/domain/knowledge.ts` and the implemented workflows in `backend/actions/cart.ts`, `rentals.ts`, `offers.ts`, `provider-account.ts`, `provider-business.ts`, `distributor*.ts`, the shop/customer pages and the existing POS landing/workspace. The new `backend/domain/public-offerings.ts` centralises the editorial source; `public-site.ts` centralises the navigation and route set.

## Indexing boundaries

`frontend/lib/seo.ts` is the explicit allowlist for the static marketing/guide sitemap. Existing dynamic public provider storefronts retain their own canonical metadata; they are not added to the static sitemap without a separate data-backed active-profile inventory. Unknown offering/guide pages remain 404/noindex. Sitemap dates and priorities are not fabricated.

The root metadata is private by default. Public pages using `pageMetadata()` explicitly override it. Sensitive portal/authentication/Till application routes and API responses also receive noindex headers. Robots allows public crawling and retains the API restriction. Noindex is an indexing directive, not a data-access mechanism; the existing session, role and server-action guards are preserved.

## Review without deployment

The feature branch is disabled in `vercel.json` through `git.deploymentEnabled`, preventing its Git-integrated preview deployment. Other branches retain the existing behaviour. The GitHub validation workflow builds/tests without deploying. No deployment CLI, merge or promotion is part of this task. This branch-specific rule can remain inert after an approved merge or be removed in a separate approved release change.

## Verification and handover

Tests validate canonical sitemap membership, unique offering content, valid linked guides, matching structured-data URLs, safe JSON-LD serialization and preserved analytics privacy rules. Browser checks cover sitemap URLs, successful responses, actual metadata, server-rendered content with JavaScript disabled, private noindex headers, unknown-route 404s, navigation and mobile widths. Sanitized HTTP evidence from the local production build is saved in [after-local.json](./after-local.json); compare it with the dated production snapshot rather than treating the local result as a deployment.

The implementation keeps the new offering pages, header and breadcrumb components on the server. Only the existing mobile menu and footer interactions need client state. Native disclosure elements, labelled navigation, keyboard dismissal and visible focus styles preserve accessible interaction without an added SEO or UI library.

See [validation and reproduction steps](./validation.md) for check results and evidence boundaries. Follow [the Search Console checklist](./search-console-checklist.md) after an approved release. Repository tests and a local build do not prove Google has indexed the pages, selected the preferred canonical or generated sitelinks.

Sources: [Google sitelinks](https://developers.google.com/search/docs/appearance/sitelinks), [site names](https://developers.google.com/search/docs/appearance/site-names), [breadcrumbs](https://developers.google.com/search/docs/appearance/structured-data/breadcrumb), [Vercel branch deployment controls](https://vercel.com/docs/project-configuration/git-configuration#git.deploymentenabled), and the installed Next.js metadata/JSON-LD documentation.
