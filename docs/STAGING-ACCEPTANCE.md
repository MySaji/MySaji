# Staging acceptance record

No production transactions, schema changes, customer messages, or payouts should be used as test fixtures. Use a disposable database, sandbox gateway accounts, test email/SMS destinations, and dedicated users for every role.

Record the build commit, environment, test identity, expected outcome, actual outcome, and evidence for each case. A source implementation or a passing mock is not an end-to-end pass.

| Area | Required cases | Status |
| --- | --- | --- |
| Identity | Password-only login refused; correct OTP; expired and reused proof; Google signup/login; account recovery | Unit coverage for OTP boundary; staging pending |
| Account states | Suspend/delete/demote an already signed-in user; retry privileged operations | Implementation updated; staging pending |
| Roles | Cross-role reads/writes, team provisioning by non-admin, staff invitation | Admin guard updated; staging pending |
| Jobs | Create, pay, accept, change scope, complete, cancel, review, dispute | Staging pending |
| Orders | Cart totals, shipping, fulfilment, stock, cancellation and returns | Staging pending |
| Payments | M-Pesa, Stripe and PayPal success/failure; incorrect amounts/currency; delayed and duplicate callbacks | Sandbox pending |
| Wallet | Concurrent callback credit once; simultaneous deposits; insufficient balance; rollback after failure; ledger totals | PostgreSQL integration test supplied; requires disposable DB |
| Subscriptions/rentals | Duplicate callback/poll does not grant entitlement twice; interrupted settlement reconciles | Settlement marker added; staging pending |
| POS | Sale/void/refund; manager thresholds; accountant/cashier restrictions; branch switching | Role policy unit coverage; staging pending |
| Offline | Disconnect while open; restart offline; queued retry; switch account/store; legacy queue recovery | Scope unit coverage; device acceptance pending |
| Verification | Own-document isolation; review/reject; business permits; revoked approval | Staging pending |
| Notifications | Email/SMS/push delivery, unsubscribe, preference filtering | External delivery pending |
| Calls | Two-user audio, permission refusal, TURN relay, reconnect | TURN support added; network testing pending |
| Geography | PostGIS schema/index inventory; controlled radius cases | Read-only inventory passed: expected extension schema and all five indexes; radius cases pending |
| Operations | Fresh deployment, baseline existing DB safely, health, cron execution, alert receipt | Local checks and CI supplied; deployment pending |
| Public information | Desktop/mobile home, guide search, related navigation, unknown guide | Five production-browser checks passed locally, including all 22 guides |

External requirements: staging URL, dedicated role accounts, isolated database, gateway sandbox setup, email/SMS delivery destinations, TURN service, production hosting/scheduler access, and monitoring configuration. Supply credentials through the environment or hosting secret store, never issue descriptions or chat.
