# POS business websites: implementation and release

## Delivered flow

1. POS account creation reserves a unique business-name address in the same transaction as the new business. James Bond becomes `jamesbond.mysaji.com`; collisions receive `-2`, `-3`, etc. Reserved platform names cannot be claimed. Registration creates a PRIVATE draft, not an automatically public listing.
2. Business setup fills only an untouched draft with the business name, type and explicitly entered business phone/address. Account email, tax PIN, employee details and customer records are never copied into the website.
3. Owners open **Till > Website**. They can edit business details, colour, story, services, FAQs, public contacts, opening hours and social links, and select up to 24 active catalogue items across their own branches. Catalogue search supports larger product lists. The existing saved Till logo is reused.
4. AI suggests headline, introduction and about copy plus questions to answer. Only entered business copy is sent. The owner sees suggestions before choosing Apply to draft; nothing automatically saves or publishes. `POS_WEBSITE_MODEL` defaults to `gemini-3.6-flash`. Temporary 502/503/504 overload retries once using `POS_WEBSITE_FALLBACK_MODEL` (default `gemini-3.5-flash-lite`; set empty to disable). Credential and quota failures do not trigger fallback. Manual editing remains available.
5. Save draft preserves the separate published snapshot. Saved preview is authenticated and owner-only on the main domain. The owner explicitly confirms accuracy/public contact authorisation before publishing. Required introduction, business description and a public contact/address are validated. Stale tabs cannot overwrite newer versions.
6. Published websites serve Home, Our story, Products, What we do and Visit & contact where applicable. Responsive navigation, searchable catalogue, real prices, FAQs, hours, phone/email/WhatsApp links, directions and footer links use owner-entered information. There is no pretend checkout, invented testimonials or automated claim that unconfigured services operate.
7. Unpublish removes the public snapshot and retains the private draft. Search engines or external caches may retain previously public data temporarily.

## Security and discovery

- Actual business ownership is required for all editor, catalogue-search, AI and publish/unpublish actions; employee permissions cannot grant ownership.
- Public queries only return published snapshots from active, non-deleted owners and explicitly selected active products from the business's stores. Sensitive stock, cost, account, transaction and tax fields are excluded.
- Tenant Host routing allows only the known public website routes and GET/HEAD. Private portals, APIs and server actions are rejected before platform authentication. Tenant query strings cannot enable owner previews. Multi-label/reserved hosts are rejected; Host is used, not an untrusted forwarded host override.
- Tenant root HTML omits marketplace sessions, providers, account notifications and subscriptions. Dynamic content is escaped by React; social URLs require HTTPS. JSON-LD is escaped. Colours are validated hex strings.
- Public canonical/OG URLs identify the business subdomain. Actual page breadcrumbs carry BreadcrumbList markup. Only real published pages enter the per-business sitemap. Draft previews, owner editor and main-domain duplicates are noindex. Google controls indexing; publication does not guarantee ranking.

## Verified on 23 October 2026

- TypeScript and changed-file ESLint pass. Full lint completes with pre-existing warnings.
- Unit tests cover collision/idempotence, reserved hosts, owner access, foreign products, private previews, publication review, separate snapshots, stale writes, unpublish, AI input minimisation, overload fallback and proxy isolation.
- Real React browser fixtures at 320/390/1280px cover public navigation/search/contact links and owner editing, draft save, AI review/apply and explicit publish consent. Fixtures use sample data and mocked persistence; they are not production owner sessions.
- A live provider request with fictional business data received HTTP 503 high demand from the primary model; the fallback model successfully returned schema-valid website copy. No real customer/business records were sent in this smoke test.
- The configured remote database was inspected read-only: `pos_business_websites` is missing. Migration history also lists earlier baseline/payment migrations as pending despite existing POS tables. Do not blindly run `prisma migrate deploy`, `db push`, reset, or mark the baseline applied without reconciling it.
- `mysaji.com` uses Cloudflare nameservers. A random test business subdomain did not resolve. Vercel project-domain inspection returned 403 for the connected team; no domain changes were made. The connector did not expose its suggested team-authorization recovery tool.

## Concrete release plan (approval required; not executed)

1. Back up the target database and verify the intended application/environment. Generate Prisma client in the deployment build (`npm ci`/postinstall already does this).
2. Apply ONLY `backend/prisma/migrations/20261020010000_pos_business_websites/migration.sql`, which adds one table, indexes, a format check and business foreign key. The reviewable installer is `node backend/scripts/install-pos-websites.cjs`; default execution is read-only. After approval, `node backend/scripts/install-pos-websites.cjs --apply` applies only this migration in a transaction, with the address-allocation lock, and skips an already present complete table. It does not run unrelated historical migrations or modify existing businesses. Resolve Prisma's historical migration baseline separately before resuming normal deployment migrations. Do not drop the website table once owners have saved content; rollback the application while retaining data.
3. Confirm which hosting project serves `mysaji.com`. Grant domain-inspection access to the correct Vercel team if Vercel is the host; project name alone is not proof. Configure `*.mysaji.com` on that same application and arrange wildcard TLS using the host's supported process. Use the DNS targets returned for that actual project. DNS remains at Cloudflare today: preserve all existing MX/TXT and other records. Do not switch nameservers without a reviewed zone migration. A wildcard DNS record alone does not guarantee a valid HTTPS certificate. Vercel wildcard certificate management has nameserver requirements: https://vercel.com/docs/domains/working-with-ssl and https://vercel.com/docs/domains/working-with-domains.
4. Deploy the approved application build with its existing auth/DB credentials and `GEMINI_API_KEY`; optional website model overrides are documented in `.env.example`. Never put provider or database keys in NEXT_PUBLIC variables. No secret values were changed or committed by this work.
5. Smoke-test a dedicated owner business: register; confirm reserved slug; finish business setup; open Website; save/edit/preview; select catalogue products; request/apply suggestions; approve/public publish; visit the real subdomain on mobile/desktop; test contact links and sitemap; change draft without changing public content; republish; unpublish; verify public 404. Test duplicate-name registration and employee refusal, plus tenant `/api/auth/session`, `/pos/home` and POST access rejection. Avoid production test customer transactions.

Production status is **not live** until the approved migration, domain/HTTPS activation, deployment and real-domain smoke test succeed. Local build or mocked browser tests must not be presented as proof of live operation.

## Final verification evidence

- Final production build (`next build --webpack`) succeeded, including TypeScript and all new routes. Existing root metadataBase warnings remain outside this feature.
- Full unit suite: 112 tests, 111 passed, one optional unrelated PostgreSQL test skipped, no failures. Changed-file ESLint has no warnings/errors; full lint has 36 existing warnings and no errors.
- Browser fixtures also rendered About, Products, Services and Contact at mobile width with visible breadcrumbs and no horizontal overflow.
- Real HTTP checks against the built app on a temporary localhost server passed: business-host account/POS/internal-draft routes and POST requests return 404 without account cookies; reserved hosts return 404; signed-out owners see an access denial; private previews return 404. The temporary server was stopped.
- The installer was executed in default read-only mode against the configured database and correctly reported the missing website table. No DDL was applied and no business or customer rows were created. A real registration/publish/subdomain smoke test remains dependent on the approved migration and domain activation.

## Approved activation update - 23 October 2026

The owner approved the website-only migration and deployment. The installer ran with `--apply` against the configured database and completed successfully. Read-only verification confirmed all nine columns, unique business and subdomain indexes, the business foreign key and slug-format check. No unrelated pending migration was applied. Because installation used the reviewed standalone SQL, Prisma migration-history reconciliation remains a separate outstanding infrastructure task; do not blindly replay the baseline migrations.

A real PostgreSQL integration check exercised address reservation, draft save, stale-version rejection, transaction isolation and publish/unpublish inside a transaction that was deliberately rolled back. An independent query confirmed that no verification website remained. Existing business records were unchanged.

Deployment remains blocked externally. The Vercel domain and deployment inspection endpoints return 403 for `oliver-otienos-projects`. There is no local Vercel CLI credential fallback. The suggested team-authorization recovery tool is not exposed by this connection. GitHub's combined status for the newer remote main commit `faf21375d5049c4c6607859ea9074f1259365ed5` reports a failed Vercel check whose target is `https://vercel.com/oliver-otienos-projects?upgradeToPro=github-private-org-to-hobby`, indicating the private-organisation/Hobby-plan deployment restriction. Resolve the team's deployment eligibility and access before another production attempt; no plan purchase or billing change was made.

Remote main also advanced through infrastructure PR #3. It was fetched for inspection only; the local working tree and newer remote infrastructure work were preserved, with no force push, merge, deployment or DNS mutation. Integrate and verify that source baseline before the eventual release. Cloudflare plugin discovery returned no available integration, so DNS needs an authorised dashboard/API route supplied by the owner. Required next inputs: Vercel team/project access, resolution of the Git deployment restriction, and access to or owner execution of the exact DNS records from the verified hosting project. Deployment approval already stands; it does not need to be requested again.
