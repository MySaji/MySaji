# Non-POS portal refresh

## Scope

Shared navigation, typography, containers, forms, table scrolling, loading states and recovery screens now apply through the customer, Saji Pro, administrator, sub-administrator, secretary, agent and distributor layouts. POS layouts are outside this change.

Customer home adds admin-managed campaign banners with a fallback discovery carousel, a two-column mobile product/service grid, products from the actual public catalogue, add-to-cart, recommendation filters and refresh, and six editable assistant starter prompts. Recommendations retain their reasons. Campaigns can pause and respect reduced-motion preferences. Assistant prompts open drafts; they do not submit messages automatically.

Saji Pro has a searchable hub built from the account's enabled modules. Admin home has real verification, dispute, moderation and active-job queue counts, refresh controls and links to campaigns, team access and user management. Shared page search uses the role navigation actually rendered in the portal.

Authentication retains its role and OTP requirements, with more readable forms, password visibility labels, contact autofill and connection-error recovery. Staff creation remains administrator-only.

Emails share a responsive table-based blue/orange layout, preheader, verification-code block, action button and help footer. Password reset now uses that layout. Dynamic titles, invitation names and digest text are escaped.

## Validation performed

- TypeScript and lint checks.
- Unit suite: 64 passed; the optional database integration test was skipped.
- Browser checks with mocked accounts: login and OTP to all seven role workspaces, page search, and layouts at 1440, 390 and 320 pixels.
- Customer signup: contact verification, password validation, terms consent and login handoff.
- Customer discovery: catalogue rendering, add-to-cart, assistant draft handoff and dismissal.
- Local email previews at desktop, 390 and 320 pixels; no production email delivery was exercised.

## Release review still required

The common design applies across portal routes; individual page content has not all been rebuilt or manually audited. Live customer-to-provider booking, messaging, fulfilment, payment and staff-assignment scenarios need acceptance testing with deployment accounts. Browser checks used fixtures, not production accounts or live AI requests. Gmail/Outlook inbox delivery and assistive-technology audits remain release checks. Government approval or formal compliance certification requires an independent review against the applicable requirements.

## Authentication and workflow follow-up

Login and signup now have a new shared responsive frame, an interactive Customer/Saji Pro benefits panel, visible step labels, and a wider form container. Social sign-in buttons stack on narrow phones so their labels remain readable. Existing verification, registration roles and authentication actions are retained.

Customer and Pro workspace tools include a workflow dialog with up to six pinnable shortcuts. Links are intersected with rendered navigation; saved links are checked against available navigation again when reopened. Shortcuts are local to the browser, contain only page paths, and do not grant access. Full-height messaging pages retain their existing layout.

Customer orders add search across item, shop and order number, status filters, date/value sorting, real order summary counts, clear filters, and refresh/error recovery. Saji Pro quotes add a workflow guide, a wider accessible quote dialog, removable line items, running totals, validation and save/send feedback.

The public newsletter popup and footer share one consent-based subscription form using the existing `/api/subscribers` endpoint. Submission errors remain retryable; success stays visible, even when browser storage is blocked. The floating subscription button is hidden after either form succeeds and excluded from authentication and portal routes. No welcome-email delivery is promised by the UI because the endpoint sends it on a best-effort basis.

Follow-up browser checks cover the responsive auth design, Customer signup verification-to-login handoff, Customer/Pro shortcut pinning and persistence, and newsletter failure/retry/success with intercepted requests. No live account or newsletter records were created. Local database connectivity was unavailable during this pass; live subscription persistence and delivery remain unverified.
