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
