# SAJI feature evidence matrix

9 October 2026. Source inspection at commit 3ad9644eedcb1749550ef55a87bb4565af6e636f plus existing local POS changes. This is a code inventory, not end-to-end acceptance testing. No feature is certified fully verified.

Final categories: verified; implemented awaiting testing; partial; demonstration/mock; absent; blocked/nonfunctional. Current rows are provisional; module presence alone does not establish implementation completeness.

| Feature | Evidence | Provisional finding | Next verification |
|---|---|---|---|
| Authentication | auth.ts, app/api/auth/ | Implementation inspected, awaiting testing | Credentials/OAuth, recovery, sessions and account states |
| Role portals | app/customer/, app/(pro)/ and staff/agent/distributor routes | Routes present; workflows unclassified | Cross-role isolation and complete navigation |
| Jobs/orders | lib/actions/jobs.ts, orders.ts | Server operations and Prisma reads inspected; completeness unclassified | Create, accept, fulfil, cancel, persistence and ownership |
| Location discovery | lib/geo-sql.ts, scripts/enable-postgis.js | Query implementation present; live extension/indexes unverified | Read-only DB inventory and controlled radius cases |
| Messaging | lib/hooks/useConversationMessages.ts, actions/messages.ts | Five-second polling path present, awaiting testing | Two-user delivery and participant isolation |
| Calls | lib/hooks/useVoiceCall.ts, actions/calls.ts | Partial infrastructure: WebRTC and signaling present, STUN-only | Cross-network audio, relay support and reconnect |
| Wallet/escrow | lib/wallet-core.ts, payment-core.ts, settlement-core.ts | Modules present; correctness unclassified | Ledger balance, idempotency, refunds and concurrent settlement |
| M-Pesa | lib/actions/payments.ts, callback routes | Integration code; missing credentials simulates completion | Sandbox callbacks, reconciliation and production setup |
| Stripe/PayPal | payments actions and callbacks | Paths present; live availability unverified | Sandbox payments, validation and failure/refund cases |
| Airtel | .env.example and callback path | Sample explicitly says not implemented | Review actual response; disable unavailable option |
| Bank transfer | .env.example, secretary payments | Documented manual reconciliation | Staff permissions and deposit audit trail |
| POS/inventory | provider/till/, pos-sales.ts, pos-stock.ts | DB operations present; local changes uncommitted | Sales/returns, stock, offline sync and schema alignment |
| KYC/access gates | verification-gate.ts, kyc-review-core.ts | Modules present; coverage unclassified | Sensitive-operation gate coverage and document isolation |
| AI | lib/ai/credentials.ts, chatbot.ts | Provider/fallback and unconfigured paths present | Real calls, quotas, privacy and simulation disclosure |
| Email/SMS/push | lib/email.ts, sms.ts, push.ts | Modules/configuration present; delivery unverified | Actual delivery, recovery/OTP limits and unsubscribe |
| Reporting/staff | Role routes and matching actions | Files present; workflow status unclassified | Financial reconciliation, exports and staff permissions |
| Health/monitoring | app/api/health/route.ts, Sentry config | SELECT 1 health check inspected; monitoring configured | Deployed health response and alert/event receipt |
| Cron | vercel.json, app/api/cron/ | Three schedules declared; scheduler unverified | Actual executions and token enforcement |
| Self-host deployment | next.config.mjs, prepare-standalone.js | Partial: standalone configured, postbuild helper empty | Reproducible packaging, assets, Prisma engine and startup |

A completion percentage and development quotation require staging acceptance workflows, recorded failures, authorization review and estimates of remaining work. Source counts cannot supply them.

Future architecture requirement: separate saji-frontend and saji-backend repositories communicating through versioned APIs. This extraction is planned, not implemented; each migrated feature requires contract, authorization and independent deployment verification. See the architecture document for the migration sequence.
