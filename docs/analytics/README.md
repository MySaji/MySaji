# MySaji search, analytics and monitoring

Developer implementation and verification: [SEO implementation](../seo/SEO_IMPLEMENTATION.md), [audit](../seo/REPOSITORY_AUDIT.md), [acceptance checklist](../seo/SEO_VERIFICATION_CHECKLIST.md), [QA results](../seo/QA_RESULTS.md).

## Requires owner action, in order

1. Review this branch and its checks; approve deployment separately. Nothing is merged or deployed by this task.
2. Set NEXT_PUBLIC_SITE_URL=https://mysaji.com. Restrict staging with authentication and/or an ingress X-Robots-Tag: noindex; NODE_ENV=production also applies to staging and cannot distinguish it automatically.
3. [Verify the mysaji.com Domain property in Google Search Console](GOOGLE_SEARCH_CONSOLE.md) using Cloudflare DNS, then submit https://mysaji.com/sitemap.xml after deployment.
4. Create the GA4 web stream and GTM web container. Configure tags exactly as described in [GA4/GTM](GOOGLE_ANALYTICS_GTM.md), set NEXT_PUBLIC_GTM_ID, rebuild, and validate a draft container in Tag Assistant before publishing it. Public NEXT_PUBLIC values are compiled into the browser bundle.
5. Approve privacy disclosures, retention/access policies and the consent wording. Rejecting is the default; an affirmative choice is required everywhere, regardless of geography. No advertising consent is requested or granted.
6. [Import into Bing](BING_WEBMASTER.md). Optionally configure [Clarity](MICROSOFT_CLARITY.md) only after privacy review and testing. Clarity project IDs live in GTM, with no NEXT_PUBLIC_CLARITY_ID or direct script.
7. Review optional Cloudflare Web Analytics and Sentry monitoring below. Confirm only one source installs each beacon.
8. Publish the approved GTM container only after the test matrix passes. Confirm data in GA4 Realtime/DebugView and revisit indexing and field performance after sufficient traffic.

## Cloudflare owner setup and performance

No Cloudflare configuration/beacon was found in the application. Account-side injection and DNS cannot be confirmed here. In Cloudflare select the mysaji.com zone, Web Analytics, and enable the site if appropriate. Prefer existing edge/request analytics initially. If adding browser analytics, choose either Cloudflare automatic injection or one manual beacon, never both. Restrict injection rules to reviewed public paths; exclude all account/authentication/transaction pages. Assess whether cookie-free measurement matches the approved privacy policy and consent choice; automatic injection does not use this app's consent state. Do not enable automatic injection if policy requires an opt-in that it cannot honor. No beacon is installed by this branch.

Official references: [setup](https://developers.cloudflare.com/web-analytics/get-started/), [injection rules](https://developers.cloudflare.com/web-analytics/configuration-options/rules/).

Monitor field LCP (good <=2.5s), INP (<=200ms), CLS (<=0.1) at the 75th percentile on mobile and desktop after enough traffic. Lighthouse is a lab diagnostic and does not establish field INP. Capture mobile lab runs on the deployed branch before/after under the same settings. Existing unoptimized images, session resolution in root layout and database maintenance checks can affect performance; changing their contracts needs separate work. The static homepage SVG already has dimensions and now has high fetch priority; GTM uses afterInteractive and is absent before consent. See QA results for actual measurements or blockers, not implied scores.

## Existing Sentry monitoring

Browser NEXT_PUBLIC_SENTRY_DSN and server/edge SENTRY_DSN remain optional. SENTRY_AUTH_TOKEN is a build secret for source-map uploads; never expose it publicly. No session replay is enabled. Existing tracesSampleRate=1.0 deserves a separate production-volume and data review. Owner must configure alert routing, releases, availability checks (/api/health if confirmed by deployment documentation), retention, URL/query scrubbing and access permissions before enabling monitoring. Existing monitoring is preserved, not claimed as newly privacy-audited. Product analytics must never receive Sentry errors, session/user IDs or request bodies.

## Missing input

The referenced Search & Analytics Setup Runbook attachment was not available. Reconcile owner-specific account policies and identifiers with that runbook when provided. No identifiers or DNS tokens have been invented.
