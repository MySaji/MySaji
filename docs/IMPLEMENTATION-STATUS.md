# SAJI implementation and validation status

Updated 16 October 2026. This document distinguishes delivered source changes from external acceptance. It does not certify the entire application as production-ready.

## Implemented

- Credentials sign-in now requires a hashed, user-bound OTP proof that expires after two minutes and is consumed atomically. Email OTPs use cryptographic randomness and hashed storage. Signup, staff invitation, and team login flows route through verified sign-in.
- Sessions re-read database roles and account status; deleted or inactive users lose session access. Admin team-account creation now checks an active administrator. Progressive verification checks active/deleted status as well as identity tier.
- Internal audit, evidence, notification, receipt creation, gateway initiation, B2C payout, referral reward, scheduled digest, POS authorization, and eTIMS queue helpers moved out of public Server Action exports into server-only services.
- Payment simulation is explicitly opt-in for nonproduction environments and cannot run in production. Missing gateway credentials otherwise return unavailable.
- Wallet top-up claims, credits, and ledger writes are atomic and serializable, with bounded conflict retries. Wallet-funded payments use conditional debits; paid jobs can reconcile interrupted transitions through status polling.
- Subscription and rental settlement uses `Payment.settledAt` to prevent duplicate entitlement delivery. Gateway amount/currency metadata is persisted for PayPal capture verification; Stripe checks paid status, currency, and amount. PayPal conversion requires explicit configuration rather than a hardcoded exchange rate.
- POS settings enforce store-settings permission. Staff context cannot impersonate another staff seat. Offline storage is partitioned by user/store, replay identity is checked server-side, and logout suspends offline access. Legacy unscoped storage is retained for reconciliation.
- Receipt references now use cryptographic randomness. Public access is rate-limited, legacy references require ownership, and public views omit wallet balances and transaction references. Rate-limit buckets are serialized across instances; forwarded IP headers are trusted only by configuration.
- Basic security headers, mandatory build type checking, working lint checks, CI validation, reviewed migrations, environment-presence checks, and standalone asset packaging were added. Maintenance routing uses `proxy.ts`.
- Optional TURN support issues expiring credentials without exposing the shared secret. POS service-worker cleanup only removes caches belonging to its own namespace.
- The homepage is now an information hub accessible to guests and signed-in users. Twenty-two linked guides at `/knowledge` include search, topic filters, article contents, related guides, and mobile layouts. Unverified default contact details were removed.

## Dependencies

Next.js 16.4.1, React/React DOM 19.3.1, Auth.js 5.0.0-beta.32, Sentry 11.8.0, jsPDF 4.2.1, and Nodemailer 10.1.1 are installed. Patched transitive resolutions are recorded in `pnpm-workspace.yaml` and the lockfile. The final registry audit during implementation reported **zero known advisories**. This is a point-in-time dependency scan, not a proof of application security.

The optional Next.js lint plugin was removed because its dependency introduced an advisory whose proposed patched version was not published. ESLint retains JavaScript safety and React hook checks.

## Validation

- Eight focused unit tests cover credentials OTP enforcement, proof replay/expiry/user binding, simulation restrictions, POS role policy, offline account/store scoping, gateway amounts, bounded transaction retries, and knowledge links/content.
- A PostgreSQL integration test exercises concurrent callbacks, simultaneous deposits, rollback, and competing wallet debits against an explicitly configured local disposable database. It is skipped locally without `SAJI_TEST_DATABASE_URL`; CI provisions a database and enables it.
- Public browser tests cover homepage navigation, search/filtering, related articles, mobile overflow, and unknown routes. Screenshots are local artifacts, not tracked source.
- Prisma schema validation and environment-name/presence checks passed without exposing secret values. A network-enabled, read-only database check confirmed 175 public tables, PostGIS in `extensions`, and all five spatial indexes. It also confirmed no Prisma migration-history table and no `settledAt`, `gatewayAmount`, or `gatewayCurrency` payment columns. External gateway credential validity is not established by these checks.
- Final production build, lint, Prisma schema validation, and Git whitespace checks passed. Eight unit tests passed; five browser tests passed against the production server, including all 22 guide pages. The PostgreSQL integration test was skipped because no disposable test database was configured. The dependency audit reported zero known advisories. CI itself has not been run from this workspace.

## Required before production deployment

1. Back up and compare the existing database, resolve the reviewed baseline, and deploy the two subsequent payment migrations. Do not execute baseline CREATE statements against populated tables.
2. Retain and monitor the verified PostGIS schema placement and five expression indexes.
3. Configure and test payment sandboxes, approved PayPal conversion, payout credentials, eTIMS, email/SMS/push, TURN, monitoring, and self-host cron scheduling.
4. Complete the role, money, stock, dispute, refund, and offline-device workflows in `STAGING-ACCEPTANCE.md` using dedicated staging accounts.
5. Review the wider financial workflows (withdrawals, dispute refunds, commissions, loyalty, wholesale and order settlement) under concurrency. This change hardens the identified top-up and payment paths; the entire ledger has not been independently certified.

A read-only database inventory was performed. No existing database migration, real payment, payout, email/SMS campaign, hosting deployment, or authenticated production workflow test was performed by this implementation task. External setup and acceptance remain pending until the corresponding environment is provided.

See [Deployment](DEPLOYMENT.md) and [Staging acceptance](STAGING-ACCEPTANCE.md).
