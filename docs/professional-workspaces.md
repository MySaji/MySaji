# Saji Pro, administration and team workspace refresh

## Scope

A shared workspace frame is applied through the existing protected layouts. It adds account-scoped personal tools and consistent spacing to the routes below; this does not mean every individual transaction form has been rewritten.

| Portal | Existing pages covered by its shared layout |
| --- | ---: |
| Saji Pro services | 48 |
| Saji Pro shop | 21 |
| Admin | 32 |
| Sub-admin | 20 |
| Secretary | 11 |
| Agent | 16 |
| Distributor | 15 |

Messages bypass the frame to retain the full-height chat and calling experience. Existing route guards, server permissions, business modules, payment paths and customer/Till portals remain in place.

## Delivered

- Search the pages in the signed-in role's actual navigation, pin up to 12 sections and revisit recent sections. Pins disappear when their module is removed from the navigation. Record-search queries are not stored.
- Comfortable or compact spacing; readable responsive headings, cards and 44px form controls. Mobile form text avoids small-input zoom.
- Browser-only personal checklist: due dates, overdue/open/completed filters, completion, copy open tasks and confirmation before clearing completed tasks. It does not assign work to other people or update financial/operational records.
- Personal state is keyed by account ID, role and workspace; private Pro overview/capability caches are also keyed by account. Draft task fields reset on account changes.
- Role-specific priorities reuse existing overview counts: verification, disputes and moderation for admin; approvals for sub-admin; withdrawal requests and reconciliation for secretary; assigned/available cases for agents; orders and low stock for shops/distributors; jobs for service professionals; invoices and connected-shop work for business owners. Zero counts can be revealed with Show all queues; unknown counts stay unknown.
- Admin team directory: search name/email/department/job title/manager, filter role and access, and open a member's recorded audit activity. Inclusive EAT date filters, bounded ranges, stable pagination, retry and empty states. Activity is limited to recorded audits, not a claim of complete attendance or productivity.
- Saji Pro staff directory: contact/skill search, invitation filters, active-account summary, wider responsive staff grid, clipboard failure feedback and confirmed invite revocation.
- Business overview and field jobs show recovery states. Field actions now report failures instead of silently presenting them as successful.

## Data and security

No schema migration or new runtime dependency is required. Team activity is restricted on the server to active administrators via the existing requireAdmin function. Targets must be non-deleted sub-admins, secretaries or agents. Only audit ID, action, entity type and timestamp are selected; old/new JSON payloads are excluded. Queries use inclusive EAT days, an exclusive end boundary, a maximum 366-day range, and 50 records per page.

Local checklists are device/browser convenience data, not a confidential document store or synchronised business task system. Do not enter customer credentials or sensitive personal details in task titles. The admin wallet is excluded from saved navigation.

## Verification

- Unit/service tests execute actual TypeScript with explicit mocked dependencies; no test account, live message or payment is created.
- Browser fixtures render the actual frame, priorities and activity dialog at 390px and 1280px. They test pins, revocation of navigation, task filters/completion/clear confirmation, account reset, role changes, full-height message bypass and activity date requests.
- Browser fixtures stub authentication, action responses and UI primitives; they are not a production end-to-end payment, invitation or login test.
- Run `node --test tests/*.test.cjs`, targeted ESLint, `npm run typecheck`, and `npx playwright test tests/browser/professional-workspaces.spec.ts`.

Production verification should sign in as each role, confirm the real navigation and its permitted queues, invite/revoke a test staff account, and review existing audit records. No deployment is performed by this change.
