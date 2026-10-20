# SAJI deployment and database operations

## Build and run

Use Node.js 22 and pnpm 11.15.1. Copy `.env.example` to `.env`, configure the integrations needed, and never commit `.env`. `NEXT_PUBLIC_` entries are browser-visible.

```sh
pnpm install --frozen-lockfile
pnpm env:check
pnpm exec prisma validate
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm start
```

Build on the target operating system. Linux builds produce `.next/standalone`; the postbuild script copies `public` and `.next/static`. Run `node .next/standalone/server.js` with the correct `PORT`, `HOSTNAME`, and runtime environment. Windows builds skip standalone unless `NEXT_STANDALONE=1`; forced Windows standalone needs symlink permissions.

The current font setup downloads fonts at build time. The build environment needs access to Google Fonts. Payment simulation requires explicit `ALLOW_PAYMENT_SIMULATION=true` and cannot run in production. Missing credentials disable a gateway rather than marking a transaction paid.

## New databases

Run `node backend/scripts/verify-database.cjs` for a read-only connectivity, migration-history, payment-column, and spatial-object inventory. It never prints connection values or customer records.

The tracked baseline creates the application's relational schema. Historical manual SQL is archived under `backend/prisma/manual/`; it must not be replayed in addition to the baseline.

```sh
pnpm db:deploy
node backend/scripts/enable-postgis.js
node backend/scripts/enable-postgis.js --check
```

PostGIS needs database extension privileges and must be installed in the `extensions` schema expected by `geo-sql.ts`. The spatial expression indexes are managed outside Prisma. Do not assume `migrate deploy` installs them.

## Existing databases created with db push

**Do not apply the baseline CREATE statements to an existing populated database.** Take and verify a backup. Compare the live database with the baseline in an isolated staging environment, including constraints, indexes, and extension placement. Only after confirming equivalence, mark `20261015000000_baseline` as applied using `prisma migrate resolve --applied 20261015000000_baseline`. Then run `prisma migrate deploy` to add subsequent migrations, including `Payment.settledAt`.

The settlement migration marks existing completed payments as settled so old subscriptions are not extended twice. Review historical pending payments separately. No migration has been applied to the existing database by the implementation task.

Use `DIRECT_URL` for migration operations. `DATABASE_URL` may use the application pooler. Avoid `db push --accept-data-loss` in production. Create future changes with `prisma migrate dev` against a development database and deploy reviewed migrations with `migrate deploy`.

## Going live on a custom domain (mysaji.com)

Most of the application already derives its public address from configuration
rather than hard-coding it: `frontend/lib/seo.ts`, `robots.ts`, `sitemap.ts`
and the email templates all read `NEXT_PUBLIC_SITE_URL` and already fall back
to `https://mysaji.com`. So going live is mainly a configuration change, with
a short list of external consoles that must be told the same thing.

The failure mode to watch for is a **partial** change: sign-in works, and then
a password-reset email links to the old host, or Safaricom posts a callback
into the void. Everything below points at one origin or none of it does.

### 1. Environment variables

Set all of these to the same origin, with `https://`, no trailing slash, and
one consistent host (pick `https://mysaji.com` or `https://www.mysaji.com` and
redirect the other at the DNS or hosting layer; do not serve both).

| Variable | Why it exists |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Canonical URLs, `robots.txt`, `sitemap.xml`, Open Graph tags. Browser-visible. |
| `AUTH_URL` | The origin Auth.js pins requests to. Setting it also turns on `trustHost`. |
| `NEXTAUTH_URL` | Compatibility alias read where `AUTH_URL` is absent. Set both. |
| `CALLBACK_URL` | Payment gateway callbacks, and the remote `<img>` in every email. |
| `MPESA_CALLBACK_ORIGIN` | Where Safaricom posts STK results. Refuses anything that is not public HTTPS. |
| `EMAIL_SITE_URL` | Only if email links must differ from the site, which is unusual. Leave unset otherwise. |

`backend/services/pos-mpesa-core.ts` throws rather than guessing if the M-Pesa
origin is still localhost, so a forgotten value fails loudly at the point of
connecting a merchant instead of silently losing callbacks.

### 2. External consoles

These live outside the repository and are the usual cause of "it worked in
staging":

- **Google OAuth** — add `https://mysaji.com/api/auth/callback/google` to the
  authorised redirect URIs, and `https://mysaji.com` to the authorised
  JavaScript origins. Keep the old entries until the cutover is proven.
- **Safaricom Daraja** — the callback URL registered for the shortcode must be
  the new origin. Per-shop POS callbacks are built from
  `MPESA_CALLBACK_ORIGIN` at request time, so those follow the variable; the
  platform-level registration does not.
- **PayPal** — return and cancel URLs, and the webhook endpoint.
- **SMTP / sending domain** — SPF, DKIM and DMARC records for `mysaji.com`, or
  mail from the new domain lands in spam. `SMTP_FROM` should be on the domain
  you authorise.
- **Sentry** — add the new origin to the project's allowed domains so events
  are not rejected.
- **Google Tag Manager** — the container is keyed by domain in most setups.

### 3. DNS and hosting

- `A`/`AAAA` or `CNAME` for the apex and `www`, pointed at the host.
- TLS certificate covering both names.
- One of the two redirects to the other, permanently. Serving the same content
  on both splits sessions, because a cookie set on one host is not sent to the
  other.
- `vercel.json` pins `regions: ["fra1"]` next to the eu-central-1 database.
  That is about latency, not the domain, and does not change here.

### 4. Things inside the repository worth checking

- `public/manifest.json` and `public/till-manifest.json` use **relative**
  `start_url` and `scope`, so they need no change. Installed copies of the POS
  on an old host keep their old scope, which is correct: they were installed
  from a different origin.
- The POS service worker at `public/pos/sw.js` claims `/pos/`, also relative.
- Nothing in `app/`, `backend/` or `frontend/` hard-codes a host except the
  `https://mysaji.com` defaults in `frontend/lib/seo.ts` and
  `backend/services/email-templates.ts`, which are already the intended value.

### 5. Proving it

After deploying, from outside the network:

```sh
curl -sI https://mysaji.com | head -1                 # 200, and www redirects
curl -s  https://mysaji.com/robots.txt | grep -i sitemap
curl -s  https://mysaji.com/sitemap.xml | head -3     # URLs on the new host
curl -sI https://mysaji.com/manifest.json | head -1
```

Then exercise, in order: sign in with Google; trigger a password-reset email
and check the link host; take one real M-Pesa payment and confirm the callback
arrives. A sandbox STK push that never calls back is the single most common
symptom of a missed value here, and it is silent.

## Gateway callbacks and jobs

Use a stable HTTPS `CALLBACK_URL` matching the deployment. Set the canonical `AUTH_URL` (or compatibility `NEXTAUTH_URL`) to the same deployment origin. SAJI trusts that explicitly pinned auth origin. Without one, Auth.js retains its host-trust policy; self-hosted reverse proxies may need `AUTH_TRUST_HOST=true` only when their forwarding headers are controlled. See [Auth.js deployment guidance](https://authjs.dev/getting-started/deployment). Configure M-Pesa and PayPal sandbox/production modes intentionally. Stripe needs its webhook secret. PayPal additionally needs an operationally approved `PAYPAL_KES_TO_USD_RATE`; the initiated gateway amount and currency are stored for capture verification. Legacy pending PayPal payments without these fields require manual reconciliation. Verify callback amount, currency, duplicate delivery, failure, and timeout behavior using each provider's sandbox. Provisioned credentials alone do not establish successful settlement.

Vercel uses `vercel.json`. Self-hosted deployments need an external scheduler making authenticated requests with `Authorization: Bearer <CRON_SECRET>`:

| Endpoint | UTC schedule | Nairobi time |
| --- | --- | --- |
| `/api/cron/email-digest` | Monday 08:00 | Monday 11:00 |
| `/api/cron/subscriber-digest` | Monday 09:00 | Monday 12:00 |
| `/api/cron/expire-provider-stories` | Daily 02:00 | Daily 05:00 |

Store scheduler credentials securely; do not place them in tracked command files or logs. Verify executions and failure alerts. Enable Sentry DSNs and choose a production sampling rate. Monitor `/api/health` without logging database credentials.

## TURN and trusted proxies

Configure `TURN_URL` and `TURN_SHARED_SECRET` for a TURN server supporting time-limited HMAC credentials. The shared secret stays on the server; authenticated clients receive credentials expiring in one hour. Validate calls between networks that require relaying.

Set `TRUST_PROXY_HEADERS=true` only when your trusted ingress strips supplied forwarding headers and writes its own. Otherwise rate-limiting deliberately uses a shared bucket. Restrict the browser Maps key by authorized origins and APIs.

## Offline POS upgrade

New catalogues and outboxes are partitioned by user and store. Legacy `saji-till` data is retained but is not replayed automatically because it has no reliable tenant identity. Before upgrade, synchronize pending sales while signed into their original store. If a device already has legacy pending entries, retain its browser data and reconcile them manually with the correct shop; never copy them into another store's queue. Do not clear site data with unconfirmed sales.

## Validation environments

Unit tests run without real service credentials. PostgreSQL tests run only when `SAJI_TEST_DATABASE_URL` identifies a **local disposable database** whose name ends in `_test` or `_ci`; they are skipped otherwise. CI provisions its own database and runs these tests. No tests silently fall back to `DATABASE_URL`.

Browser checks use `pnpm test:browser` with the application already running and `SAJI_BROWSER_BASE_URL` set as needed. They cover public pages, search, article navigation, unknown routes, and mobile overflow. Full financial and role workflows require seeded staging accounts and provider sandboxes; see `STAGING-ACCEPTANCE.md`.
