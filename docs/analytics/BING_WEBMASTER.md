# Bing Webmaster Tools

Developer: /sitemap.xml uses standard Next XML URL-set output; /robots.txt has a wildcard user agent and absolute sitemap URL, compatible with Bing as well as Google. Public metadata and canonicals are shared, with no engine-specific indexing workaround.

Owner:

1. Sign in at https://www.bing.com/webmasters/ with the organization Microsoft account.
2. Prefer Import from Google Search Console after mysaji.com is verified there. Authorize the requested Google access, select the verified property, and confirm sitemap import and ownership status. Review continuing permissions afterward.
3. Alternatively add https://mysaji.com manually and follow Bing's exact DNS verification record instructions in Cloudflare, preserving other DNS entries. Optional HTML meta verification uses BING_SITE_VERIFICATION, copied exactly from Bing, followed by a rebuild. No fabricated value is provided.
4. In Sitemaps confirm https://mysaji.com/sitemap.xml is present and processed; submit it if absent. Inspect representative public URLs and review crawl/indexing errors.
5. Keep account pages excluded via noindex/access controls. IndexNow is not implemented: it requires a deliberate key ownership and URL publication policy, and is unnecessary for initial sitemap readiness.

Official [add, verify and import](https://www2.bing.com/webmasters/help/add-and-verify-site-12184f8b), [sitemaps](https://www2.bing.com/webmasters/help/sitemaps-3b5cf6ed).
