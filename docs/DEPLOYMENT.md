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
