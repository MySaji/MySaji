# MySaji Google Search Console checklist

Production site: **https://mysaji.com**. This is an operator checklist, not evidence that Search Console has been configured. No DNS changes, sitemap submissions or indexing requests were made by this pull request. Complete the post-release steps only after the change is approved and deployed.

Google chooses sitelinks automatically when they are useful for a query. A clear hierarchy, descriptive links and accurate metadata can help Google understand the site; none of these steps can force sitelinks or guarantee indexing, rankings or a particular display.

## 1. Verify domain ownership

- Sign in to [Google Search Console](https://search.google.com/search-console/) with the organisation’s intended owner account.
- Add a **Domain property** for `mysaji.com`, without `https://` or a path. Domain verification normally uses DNS and covers protocols and subdomains. Use a URL-prefix property only when that is the intended narrower scope.
- Copy the exact verification TXT record supplied by Google. Add it at the authoritative DNS provider for this domain; do not guess a token or delete unrelated records. Wait for DNS propagation and verify in Search Console.
- Keep the verification record after verification. Grant the smallest appropriate Search Console access to colleagues and keep the organisation in control of ownership.
- Record the property owner, DNS provider, verification date and responsible maintainer in internal operations records. Do not commit private credentials or fabricated verification tokens.

Reference: [Verify site ownership](https://support.google.com/webmasters/answer/9008080).

## 2. Check the approved release before submission

- Confirm that `https://mysaji.com/` returns 200 and has a single MySaji `WebSite` node, a useful H1 and the production canonical.
- Confirm 200 responses and useful server-rendered content at `/shop`, `/work`, `/rent`, `/grow`, `/pro`, `/knowledge` and `/pos`.
- Check that HTTP, www and hosting-provider aliases resolve or canonicalise to the intended HTTPS domain. DNS/hosting redirects must be checked in the real hosting configuration; this PR does not change domain settings.
- Confirm that each indexable page has one canonical, a unique title and description, `index, follow`, and no conflicting `X-Robots-Tag: noindex` header.
- Confirm that authentication, portal, staff-invitation and Till application URLs retain noindex and their existing access protections. Robots directives do not replace authentication.
- Inspect the canonical image asset and site icons. Check mobile navigation, readable text and internal links without signing in.

## 3. Submit and inspect the sitemap

- Open `https://mysaji.com/sitemap.xml` and confirm a successful XML response with canonical HTTPS URLs only.
- Open `https://mysaji.com/robots.txt` and confirm its sitemap declaration points to that same sitemap. Public content must be crawlable. Do not block pages solely to prevent indexing if Google needs to see their noindex directive.
- In the verified property’s **Sitemaps** report, submit `https://mysaji.com/sitemap.xml` once and check processing status, fetch errors and discovered URLs. Submitting a sitemap is a discovery hint, not a promise that every URL will be indexed.
- Do not submit localhost, preview URLs, authentication pages, query-token URLs or private dashboards. There is no separate `/learn` duplicate: Learn links to the canonical `/knowledge` hub.

Reference: [Sitemaps report](https://support.google.com/webmasters/answer/7451001).

## 4. Inspect important URLs

- Use **URL Inspection** for the homepage, each offering page, the guides hub, Saji Till and a representative guide article.
- Review the indexed result and run **Test live URL** after deployment. Inspect HTTP status, crawl permission, indexing permission, rendered HTML, screenshot and discovered/user-declared canonical.
- Compare Google’s selected canonical with the declared `https://mysaji.com` canonical. Investigate duplicate pages, redirects, conflicting metadata or internal links if they differ; the declared canonical is a preference, not a command.
- Where appropriate, request indexing for a small number of genuinely new or substantially updated public pages. Do not repeatedly request unchanged URLs or request indexing for private pages.
- Treat “Discovered” or “Crawled – currently not indexed” as diagnostic information. Check unique value, navigation, successful responses and canonical signals before making further changes.

Reference: [URL Inspection](https://support.google.com/webmasters/answer/9012289).

## 5. Validate structured data

- Validate the homepage’s `WebSite` JSON-LD with [Schema Markup Validator](https://validator.schema.org/). Google’s Rich Results Test does not validate the site-name feature.
- Validate representative offering, guides and Till breadcrumbs with the [Rich Results Test](https://search.google.com/test/rich-results). The visible breadcrumb trail and `BreadcrumbList` must describe the same real navigation.
- Keep one `WebSite` node on the homepage. Do not add a fake search action, unsupported business claims, ratings, review counts or additional site-name nodes for product subdirectories.
- Structured-data validity does not guarantee a rich result or sitelink.

References: [Site names](https://developers.google.com/search/docs/appearance/site-names), [Breadcrumbs](https://developers.google.com/search/docs/appearance/structured-data/breadcrumb).

## 6. Monitor after release

- Check **Page indexing** and **Sitemaps** weekly during the initial release period, then on a regular maintenance schedule. Investigate new 404s, redirect errors, server errors and “excluded by noindex” changes affecting intended public pages.
- Check **Performance → Search results** for MySaji brand queries, offering-page impressions, clicks, CTR and average position. Compare comparable periods and account for query, country and device differences. Avoid drawing conclusions from small samples.
- Monitor **Core Web Vitals**, mobile usability in actual devices and PageSpeed Insights; resolve measured issues rather than adding unneeded libraries or scripts.
- Review **Security issues**, **Manual actions** and any supported structured-data enhancement reports.
- Search results vary by query and user context. Record observations of sitelinks without presenting their presence or absence as a directly configurable setting.
- Recheck the sitemap and internal links when a public offering changes. Update copy when a feature changes, remove retired pages with an appropriate redirect where one exists, and retain noindex on private routes.

Reference: [Google sitelinks guidance](https://developers.google.com/search/docs/appearance/sitelinks).
