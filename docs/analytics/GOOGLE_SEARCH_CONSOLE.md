# Google Search Console

## Developer work

Next metadata routes generate /sitemap.xml and /robots.txt without a database enumeration. The proxy bypasses maintenance redirects for these two endpoints. Canonicals use NEXT_PUBLIC_SITE_URL. Public pages explicitly opt into indexing; application pages inherit noindex/nofollow. Do not replace this with a robots ban on private HTML: crawlers need to retrieve the noindex directive. Robots is not access control. /api/ is disallowed.

GOOGLE_SITE_VERIFICATION optionally emits the HTML meta value for a URL-prefix property. It is not a substitute for Domain-property DNS verification. Leave it blank unless Google supplies a value.

## Owner steps: Domain property mysaji.com

1. Sign in at https://search.google.com/search-console with the organization-controlled Google account. Add property, choose Domain, enter mysaji.com (no scheme or path).
2. Copy Google's exact TXT record; do not use a sample token.
3. In Cloudflare, choose the mysaji.com zone, DNS, Records, Add record: type TXT, name @, content the complete google-site-verification=... value, TTL Auto. TXT records have no proxy toggle. Preserve existing TXT records, particularly SPF/DKIM/DMARC.
4. Save, allow DNS propagation, return to Search Console and Verify. If needed, inspect `Resolve-DnsName -Type TXT mysaji.com` in PowerShell. Keep the record after successful verification.
5. After approved deployment, verify https://mysaji.com/sitemap.xml returns XML with 200 status and the correct origin; submit sitemap.xml in Sitemaps.
6. URL Inspection: test /, /knowledge and a real guide. Check live fetch, declared canonical, rendered content and absence of noindex. Request indexing for a representative public URL; submission does not guarantee indexing.
7. Inspect /auth/login and representative account pages: they must remain noindex or inaccessible. Review Page Indexing, Sitemaps and Core Web Vitals over time; grant least-privilege access to collaborators.
8. Confirm HTTP and www variants redirect to the preferred HTTPS origin at the hosting/Cloudflare layer without loops. That DNS/redirect configuration is outside this repository.

Official [ownership verification](https://support.google.com/webmasters/answer/9008080?hl=en), [Next sitemap route](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap).
