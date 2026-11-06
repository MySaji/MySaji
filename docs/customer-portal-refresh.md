# Customer portal refresh

## Scope

The source inventory covers all 40 customer route pages. Shared customer styling and navigation apply through `CustomerLayout` and `CustomerPortalFrame`; the dedicated content redesigns focus on home, community, group discussions, favourites, saved addresses and recurring maintenance. Conversation screens keep their full-height space for messaging and calls.

The shared frame adds real related-page links and a comfortable/compact spacing preference. The preference is stored per account in the browser, without saving private form data. Breadcrumbs identify the section and detail level without displaying raw record IDs. Headings, card edges, focus states, form controls, tables and mobile input sizing share customer-scoped rules. Workspace tools scroll horizontally on small screens. The application keeps the established blue and orange theme.

## Community features

- Search post text, author names and locations on the server, rather than only scanning the first loaded page.
- New date-window, following, saved, own-post and zero-reply views. Archived posts are excluded. The server derives private filters from the signed-in account.
- Stable date/ID pagination loads 30 visible posts plus a continuation row. Older posts can be loaded without replacing the current feed.
- Trending and most-discussed ordering are explicitly labelled as ranking the loaded results; they do not claim a global ranking.
- Authors can edit their post text while keeping media and discussion. The original text is compared on save so a stale editor cannot overwrite a newer edit.
- Users can explicitly save and restore a text/location draft in the current browser tab. Draft keys include the account ID. Attachments are not persisted. Publishing clears the saved draft.
- Question and local-tip prompts open the real editor. Mobile advanced filters collapse behind a control, and starting points form a swipeable strip.
- Existing likes, saved posts, follows, media, sharing, reports and group discovery remain connected to their server actions.

## Group workspace

The group page has a responsive discussion column and guidance sidebar, media viewing, per-post comments, member search, sharing and creator settings. The creator can update the name and description using a snapshot check. Post and group deletion use explicit confirmation dialogs and server ownership checks.

Contributions require membership on the server, including reactions and comments; hiding a button is not the permission boundary. Group uploads use the same bounded safe media rules as public posts. Text remains available after failed submissions. Comment requests are keyed to the selected post, preventing one discussion's late response from replacing another.

A group creator keeps their membership while the group exists. A creator who left a group using an earlier version can explicitly restore membership and the creator admin flag. Signed-out visits show a sign-in route instead of waiting indefinitely. Groups continue using the existing public-group model; no private-group, event, poll or live-attendance functionality is claimed.

## Everyday pages

Home displays current loaded job counts, recent-order progress and review opportunities. The next job links to the existing job detail flow. Counts are labelled according to their data source, and failed requests do not become invented zero totals.

Favourites provides specialist/shop filters, search, sorting and persistent remove/undo actions. An explicit desired save state and transaction lock prevent a retry from toggling the item back unexpectedly. Unknown provider pricing is shown as a quote request rather than a fabricated zero price.

Saved addresses has a responsive grid and type/search filters. Save, default and delete actions check results and surface errors. Editing an address manually clears its old map coordinates, including in the database, so a new building name does not retain the previous GPS pin. The selected Google/OSM provider remains in use.

Maintenance reminders have due/upcoming filters, search, due-date order and action confirmations. Recording work as serviced updates the reminder; it does not claim a new booking, payment or receipt.

## Route review inventory

| Route | Implemented layout/interaction scope |
| --- | --- |
| `/customer/booking` | Shared customer frame, relevant navigation, spacing controls and responsive card/form foundations. |
| `/customer/booking-confirmation` | Shared customer frame, relevant navigation, spacing controls and responsive card/form foundations. |
| `/customer/bookings` | Shared customer frame, relevant navigation, spacing controls and responsive card/form foundations. |
| `/customer/cart` | Shared customer frame, relevant navigation, spacing controls and responsive card/form foundations. |
| `/customer/community/[groupId]` | Responsive discussion workspace, owner settings, member search, history paging, media preview, sharing, confirmations and membership-aware contributions. |
| `/customer/community` | Server search and cursor pagination, date filters, personal and unanswered views, own-post editing, tab-local drafts, mobile filter drawer and prompt strip. |
| `/customer/favorites` | Search, type filters, sort, responsive cards, visible remove controls, explicit save state and undo. |
| `/customer/find-now` | Shared customer frame, relevant navigation, spacing controls and responsive card/form foundations. |
| `/customer/find-specialists` | Shared customer frame, relevant navigation, spacing controls and responsive card/form foundations. |
| `/customer/help` | Shared customer frame, relevant navigation, spacing controls and responsive card/form foundations. |
| `/customer/home` | New day planner, real activity counts, next job and useful account shortcuts. |
| `/customer/household/invite/[token]` | Shared customer frame, relevant navigation, spacing controls and responsive card/form foundations. |
| `/customer/household` | Wider household workspace and shared form/card sizing. |
| `/customer/jobs` | Wider activity-list container; detail content keeps a readable measure. |
| `/customer/messages` | Existing full-height conversation/call workspace, shared account navigation and customer dialog-input sizing. |
| `/customer/notifications/[id]` | Shared customer frame, relevant navigation, spacing controls and responsive card/form foundations. |
| `/customer/notifications` | Shared customer frame, relevant navigation, spacing controls and responsive card/form foundations. |
| `/customer/offers/[id]` | Shared customer frame, relevant navigation, spacing controls and responsive card/form foundations. |
| `/customer/orders/[id]` | Shared customer frame, relevant navigation, spacing controls and responsive card/form foundations. |
| `/customer/orders` | Shared customer frame, relevant navigation, spacing controls and responsive card/form foundations. |
| `/customer/privacy-policy` | Shared customer frame, relevant navigation, spacing controls and responsive card/form foundations. |
| `/customer/products/[id]` | Shared customer frame, relevant navigation, spacing controls and responsive card/form foundations. |
| `/customer/products` | Shared customer frame, relevant navigation, spacing controls and responsive card/form foundations. |
| `/customer/profile` | Shared customer frame, relevant navigation, spacing controls and responsive card/form foundations. |
| `/customer/recurring-maintenance` | Due/upcoming views, search, next-due sorting, status summary and confirmed schedule actions. |
| `/customer/referrals` | Shared customer frame, relevant navigation, spacing controls and responsive card/form foundations. |
| `/customer/rentals/[id]` | Shared customer frame, relevant navigation, spacing controls and responsive card/form foundations. |
| `/customer/requests` | Shared customer frame, relevant navigation, spacing controls and responsive card/form foundations. |
| `/customer/rewards` | Shared customer frame, relevant navigation, spacing controls and responsive card/form foundations. |
| `/customer/saved-addresses` | Wider card grid, address/type search, confirmation dialogs, resilient saves and clearing stale coordinates. |
| `/customer/search` | Shared customer frame, relevant navigation, spacing controls and responsive card/form foundations. |
| `/customer/service-requests/new` | Shared customer frame, relevant navigation, spacing controls and responsive card/form foundations. |
| `/customer/service-requests` | Wider quote-list workspace and shared form/card sizing. |
| `/customer/services/[id]` | Shared customer frame, relevant navigation, spacing controls and responsive card/form foundations. |
| `/customer/services/more` | Shared customer frame, relevant navigation, spacing controls and responsive card/form foundations. |
| `/customer/services` | Shared customer frame, relevant navigation, spacing controls and responsive card/form foundations. |
| `/customer/settings` | Shared customer frame, relevant navigation, spacing controls and responsive card/form foundations. |
| `/customer/shops/[id]` | Shared customer frame, relevant navigation, spacing controls and responsive card/form foundations. |
| `/customer/shops` | Shared customer frame, relevant navigation, spacing controls and responsive card/form foundations. |
| `/customer/wallet` | Shared customer frame, relevant navigation, spacing controls and responsive card/form foundations. |

## Validation and limits

Seven focused server tests cover route-link integrity, feed filtering/cursors, author and creator scoping, stale editors, membership/media restrictions, creator rejoining, idempotent wishlist states and clearing old coordinates. The full repository suite passed 200 tests with one optional PostgreSQL integration test skipped.

Ten new browser scenarios run the real components at 390px and 1280px with explicit action/data/UI fixtures. They exercise pagination, server-search arguments, date filters, editing, drafts, group settings/member search, signed-out and legacy-creator states, favourites undo, maintenance confirmations and home activity. The shared frame is visited under every customer route at both widths and checked for horizontal overflow. Six existing saved-address browser regressions also pass. This proves the shared layout and the selected component flows; it is not an authenticated live-business transaction test of every route.

Screenshots in `.artifacts/customer-*.png` were inspected for mobile and desktop layout. Fixtures use synthetic records and account data. No live customer posts, group memberships, payments, messages or notifications were created during verification. Existing authentication, payment controls, wallet behaviour, map selection and account ownership checks are retained. No database migration or new runtime dependency is needed for this customer refresh.

Final validation: targeted ESLint completed without errors, and the production Next.js webpack build passed, including TypeScript validation and generation of 274 static pages. Existing metadataBase warnings remain outside this customer portal change. No deployment was performed.
