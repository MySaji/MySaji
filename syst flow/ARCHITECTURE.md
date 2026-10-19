# SAJI architecture

One Next.js App Router application serves UI, Server Actions, and HTTP route handlers. `frontend/` and `backend/` are source boundaries, not separate deployments.

```text
Browser -> Server Action / app/api route -> authorization + validation
        -> backend/services -> Prisma/PostgreSQL or external API
```

Server-rendered routes can call server code directly. Client components import intentional Server Actions. SWR polls messages and selected status screens. Web Push delivers browser notifications. WebRTC carries voice audio while database-backed actions relay signaling; TURN uses short-lived server-issued credentials when configured.

## Source boundaries

`app/` owns routes and layouts. `frontend/` owns React components and browser helpers. `backend/actions/` owns intentional public action endpoints. `backend/services/` owns internal side effects, settlement, notification delivery and third-party credentials. `backend/domain/` contains definitions safe to share with browser code. The `@/` alias resolves from the repository root.

A `use server` export is a remotely callable action: comments describing it as internal do not make it private. Internal helpers use `server-only` service modules. Export only async action functions and erased TypeScript types from action modules. Every mutation needs its own authentication, account-state, permission, ownership, validation, and relevant KYC checks.

## Identity

Auth.js uses credentials and optional Google OAuth with Prisma persistence and JWT sessions. Credentials authorization consumes a hashed, expiring, single-use OTP proof. JWT reads revalidate current role and account state. Progressive KYC is checked against the database at restricted operations. POS permissions distinguish business owners, managers, cashiers, stock controllers, and accountants.

## Financial operations

Wallet top-up settlement claims a pending payment and records the credit and ledger entry in one serializable transaction with bounded conflict retries. Wallet debits use conditional balance updates. Subscription and rental entitlements use a transactionally claimed `Payment.settledAt` marker. Gateway operations live in private services. Missing credentials fail closed unless development simulation is explicitly enabled; production cannot simulate payment completion.

Notifications and receipts happen after committed wallet updates. Job payment transition is conditionally claimed and polling can retry an interrupted paid-job transition. External delivery and full multi-workflow accounting still require staging acceptance.

## POS and offline storage

The server resolves the active tenant from the session/database. Offline IndexedDB partitions use the account and shop. Every submitted or replayed sale includes expected account/store identity, checked against the live tenant. Legacy unscoped outboxes are retained for manual reconciliation and never automatically migrated. Service worker caching is limited to the till shell and build assets; POST actions remain network requests.

## Database and operations

PostgreSQL uses Prisma migrations with a baseline for the former db-push-managed schema. Existing databases require review and baseline resolution before deployment. Spatial expressions and indexes are configured separately in PostGIS. `proxy.ts` handles maintenance routing. Hosting cron, credentials, monitoring, extension privileges, and actual delivery are environment responsibilities.

See [Deployment](docs/DEPLOYMENT.md), [Implementation status](docs/IMPLEMENTATION-STATUS.md), and [Staging acceptance](docs/STAGING-ACCEPTANCE.md).
