# Cart and community update

## Cart

The customer cart now has responsive item cards, stock-aware quantity controls, explicit removal, product/service/offer labels, scheduled-service details, per-shop delivery fees, labelled contact/address fields, a wallet shortfall link, promotions and a payment review dialog. Mutation errors are visible and failed changes leave the cart intact. Controls prevent overlapping cart edits and payment submission.

Delivery quotes use the selected address coordinates and the same delivery-zone calculation as checkout. Shops are grouped by ID so equal display names do not merge fees. Optimistic catalogue entries can omit the ID until reconciled with the server. Checkout now receives the correct `shippingLatitude`/`shippingLongitude` fields. An optional `expectedTotal` from the review dialog rejects a changed total before wallet access or financial writes. Older callers retain their existing interface.

Successful checkout returns the server-calculated charged amount and preserves it in the confirmation, with links to orders, bookings and the wallet. The view no longer derives its success amount from an emptied cart. A transport error tells customers to check orders and their wallet before another attempt. This update does not introduce payment idempotency or change the existing transaction/settlement model.

## Community

The community has a clearer header, account activity counts, accessible view buttons, search across views, newest/discussion sorting, engagement-ranked trending posts, media-only filtering, joined-group filtering and working topic chips. Discovery panels are available on mobile as well as desktop. Results are limited to the loaded set of up to 50 posts; Saved posts queries the current user's saved records rather than only the main feed's recent posts.

Post links use the native share sheet when available and clipboard fallback otherwise. A shared link retrieves its specific unarchived post and offers a return to the feed. Sharing does not fabricate a share count. No live-broadcast capability is claimed: the former inactive button is now a working question composer.

Post and comment failures retain drafts. Media is validated before reading and again on the server: four supported raster photos up to 1 MB each and a supported video up to 3 MB. Upload previews can be removed; publishing waits for media preparation. Location is optional and user-entered instead of silently assigning Nairobi. Comments, reports, follows, joins and saves show errors and recover busy state. Post deletion requires confirmation and waits for server success. Account-specific caches include the signed-in user ID.

## Verification

Automated coverage checks upload limits/types and authenticated authorship, shared-post and saved-post query scope, customer-scoped delivery quotation with distinct shop IDs, and rejection of changed checkout totals before wallet access/writes. The full suite passed 77 tests with one optional PostgreSQL test skipped.

Browser fixtures exercise cart failure/retry, quantity/removal, promotions, payment review and the confirmed charged amount; community search/ranking, saves, post/comment retries, group filters, sharing, media validation/removal and delete confirmation. Desktop and 390/320px layouts are checked after responsive transitions settle. Fixtures intercept actions and do not create real orders, charges, posts or memberships.
