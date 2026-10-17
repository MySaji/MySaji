# GA4 through Google Tag Manager

## Developer implementation

One consent-gated container uses built-in next/script afterInteractive, compatible with the existing App Router and requiring no dependency change. The unconditional Vercel Analytics component is removed; its unused dependency remains to avoid lockfile churn. No direct GA4 tag, GA measurement ID, noscript iframe or Clarity script is installed. Empty or malformed NEXT_PUBLIC_GTM_ID disables GTM. Use an isolated development container rather than production IDs in local builds.

A persistent versioned localStorage choice offers equal accept/reject controls and withdrawal. No container request before acceptance. Google consent defaults deny analytics_storage, ad_storage, ad_user_data and ad_personalization before initialization; acceptance grants analytics_storage only. Withdrawal reloads to discard loaded scripts. Existing provider cookies may remain until expiration: configure retention and cookie deletion with your production consent-management provider if required. If storage is unavailable, measurement remains off. This basic first-party control is not a legal determination or certified CMP.

Only /, /knowledge and the known guide slugs load the container. Legal pages, provider storefronts and application routes do not. URLs with a query or fragment do not initially load tracking, intentionally losing campaign attribution to reduce exposure. Internal link clicks into untracked/query/fragment destinations use document navigation to discard the container. A pathname fallback reload also handles unexpected programmatic transitions; avoid adding router.push into private routes on tracked pages without a reviewed document-navigation boundary. Container-side history listeners and auto events must remain off. Container edits are privileged code changes; repository guards cannot secure an arbitrary published tag.

Page navigation emits mysaji_page_view once per distinct pathname, including initial opt-in load. It includes page_path, sanitized page_location (origin + pathname), and a fixed non-sensitive page_title. Returning to a prior path counts again. Query/fragment-only changes do not count. No document.referrer, free-text input, user ID, email, phone, account role, transaction IDs, or financial information is pushed.

## Owner configuration

1. Create a GA4 property and Web data stream for https://mysaji.com; record the real G- measurement ID inside GTM only. Set data retention, internal traffic exclusions and organization access.
2. Create a GTM Web container. Set its real GTM- ID in NEXT_PUBLIC_GTM_ID, rebuild and test on an approved preview host. Keep IDs blank until the container below is prepared.
3. Create a Google tag with the GA4 measurement ID. Configuration parameters: send_page_view=false; page_location from a Data Layer Variable page_location (v2); page_referrer empty; page_title from page_title. Trigger ONLY Custom Event mysaji_page_view, once per page. Require analytics_storage consent. Do not use All Pages, History Change, click, form or automatic DOM triggers. This ensures initialization happens with sanitized page variables.
4. In the GA4 web stream, disable Enhanced Measurement, especially browser-history pageviews, outbound clicks, site search and form interactions. Set automatic user-provided-data collection OFF; do not set user_id or enable Google Signals/advertising personalization without a separate review.
5. Create Data Layer Variables v2: page_path, page_location, page_title, search_scope, result_count. Create a GA4 Event tag, name page_view, trigger Custom Event mysaji_page_view. Map page_location, page_title, page_referrer (empty) and page_path explicitly; use the Google tag from step 3, and tag sequencing to ensure it initializes first. Require analytics_storage. Exactly this tag sends pageviews; no automatic pageviews.
6. Create GA4 Event tag search, trigger Custom Event search, require analytics_storage; map search_scope and result_count plus sanitized page_location/page_title and empty page_referrer. Fire only after the Google tag has initialized. Do not send search_term. Register custom dimensions/metrics only when useful.
7. In Preview/Tag Assistant check default denied -> analytics-only granted, one page_view per route and one debounced search event. Enable debug_mode only for the test session/container, validate GA4 DebugView and Realtime, then remove test-only settings before publishing. Check network payloads for full URLs/referrers or personal data.
8. Publish only after owner approval of the container and disclosures. Version the container and keep the previous version for rollback. App rollback: unset GTM ID and rebuild.

## Event contract and honest coverage

| Event | Status / trigger | Allowed fields |
| --- | --- | --- |
| page_view | Implemented via mysaji_page_view; requires owner GA4 tag | page_path, sanitized page_location, fixed page_title |
| search | Implemented: knowledge text filter settles for 800ms; nonempty term; no raw search text | search_scope=knowledge, result_count |
| sign_up | Reserved, not instrumented; only after confirmed account creation | approved low-cardinality method |
| login | Reserved, not instrumented; only after completed MFA/session success | approved low-cardinality method |
| view_item | Reserved, not instrumented; verified item view and safe public identifiers required | approved item type/category |
| generate_lead | Reserved, not instrumented; confirmed persisted lead required | approved lead type |
| contact_seller | Reserved, not instrumented; verified successful contact action required | approved contact method |
| job_application_submit | Reserved, not instrumented; confirmed server success required | approved category |
| rental_inquiry_submit | Reserved, not instrumented; confirmed server success required | approved category |

These reserved names are a plan, not evidence that a workflow exists or sends events. Private dashboard operations intentionally remain untracked. Never instrument a button click as submission success. Do not send message contents, listing titles entered by users, application documents, addresses, IDs or payment data. Knowledge query text is deliberately omitted even though GA recommends search_term.

Official [Next Script](https://nextjs.org/docs/app/api-reference/components/script), [Google consent](https://developers.google.com/tag-platform/security/guides/consent), [GA4 pageview controls](https://developers.google.com/analytics/devguides/collection/ga4/views).
