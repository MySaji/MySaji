# SAJI

SAJI is a Next.js marketplace and business application for customers, professionals, shops, distributors, and platform staff. Saji Till provides point-of-sale, stock, staff, and offline sale workflows.

## Technology

Next.js 16.4.1, React 19.3.1, TypeScript, Tailwind CSS 4, Prisma 6/PostgreSQL, and Auth.js 5. The browser communicates through Next.js Server Actions and selected HTTP endpoints. This is one application with separate frontend and backend directories, not independently deployed services.

## Public information

The homepage introduces the platform and links to a searchable knowledge base at `/knowledge`. Fourteen guides cover getting started, customer bookings, providers, shops, distributors, payments, verification, POS, offline operation, disputes, messaging, teams, security, and support. Content lives in `backend/domain/knowledge.ts`.

## Development

Use Node.js 22 and pnpm 11.15.1. Copy `.env.example` to `.env`; supply credentials privately. Then run `pnpm install --frozen-lockfile` and `pnpm dev`.

Validation: `pnpm env:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`. Browser checks: start the app on port 3100 and run `pnpm test:browser`. On Windows the tests use installed Chrome; other environments need Playwright Chromium.

## Database and deployment

New databases use reviewed migrations with `pnpm db:deploy`. Existing databases require safe baselining first. Never run the baseline CREATE statements against a populated database. PostGIS extension/index setup is a separate operation. See [Deployment](docs/DEPLOYMENT.md).

Missing gateway configuration disables payments by default. Development simulation is explicit and cannot run in production. Airtel is not a completed live integration. Bank reconciliation, payouts, eTIMS, email/SMS delivery, TURN relay, and monitoring require external configuration and acceptance testing.

## Project layout

- `app/`: public and authenticated routes, API handlers, layouts.
- `frontend/`: components, browser state, hooks and offline storage.
- `backend/actions/`: intentional Server Action endpoints.
- `backend/services/`: internal operations, settlement and external integrations.
- `backend/domain/`: shared business definitions and knowledge content.
- `backend/prisma/`: database schema, migrations, archived manual SQL.
- `backend/scripts/`: operational tooling and read-only action inventory.
- `tests/`: unit, isolated PostgreSQL, and public browser regression tests.

See [Architecture](ARCHITECTURE.md), [Implementation status](docs/IMPLEMENTATION-STATUS.md), and [Staging acceptance](docs/STAGING-ACCEPTANCE.md). Older audits and PDFs are historical snapshots.

## Security boundaries

Credentials sign-in consumes an expiring, user-bound OTP proof. Sessions refresh account state from the database. Sensitive actions must enforce authorization independently of page layouts. Internal mutations belong in server-only services and must not be re-exported from `use server` modules. Financial state transitions need transactions, concurrency control, and idempotency.

Never commit `.env`, expose secret values in logs, or use production credentials as test fixtures.
