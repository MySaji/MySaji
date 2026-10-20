# SEO implementation

See [pre-change audit](REPOSITORY_AUDIT.md) and [QA results](QA_RESULTS.md).

- frontend/lib/seo.ts centralizes the canonical origin, actual public route inventory, and page-specific index/canonical/Open Graph/Twitter metadata. Defaults to https://mysaji.com; set the same production origin explicitly at build time. Do not derive canonicals from request Host headers.
- Root layout defaults to noindex/nofollow. Homepage, knowledge index, each real guide, legal pages, Saji Till introduction (/pos) and existing provider storefronts explicitly opt into indexing. Unknown guides use noindex/404. Dashboard/auth/verification/POS/internal pages inherit noindex. This prevents future unreviewed pages from silently becoming indexable.
- sitemap.ts enumerates homepage, privacy, terms, /pos introduction, knowledge and actual static guides. It does not fabricate lastmod dates. Public provider storefronts have their own canonicals but are omitted until an approved public enumeration/filter exists; no database or backend contract is added.
- robots.ts allows HTML crawling (including private URLs so crawlers can read noindex), disallows /api/, advertises the absolute sitemap. Never rely on robots to protect data; existing authentication is unchanged. Proxy exempts sitemap and robots from maintenance redirects. During actual maintenance, HTML may redirect as before.
- Homepage WebSite JSON-LD describes the actual site name, URL and approved slogan only. No invented ratings, LocalBusiness addresses, prices, FAQs or features. JSON is escaped before HTML insertion.
- Existing approved logo PNGs remain favicon/apple/PWA icons and the social image; no fabricated social identity or handles. Existing theme and viewport accessibility are preserved. Manifest branding uses MySaji, removes its placeholder screenshot and preserves icon assets/start URL.
- Homepage introduces the approved Shop / Work / Rent / Learn / Grow tagline. Descriptions remain grounded in the current services, shops, professional tools, wholesale workflows and guides. Rent is an approved brand pillar, not a claim of a new public rental catalogue. No new service routes were invented.
- Homepage already has main, h1, sections and navigation; guides already have article, headings and named navigation. Search retains its accessible label/status and keyboard filters. No unrelated redesign.
- Homepage SVG dimensions reserve layout space and high fetch priority favors the main illustration. Existing global image-unoptimized setting is preserved because changing remote upload formats and hosting behavior needs separate validation. Consent-gated afterInteractive GTM adds no pre-consent third-party load. The unused Geist Mono loader is removed to avoid fetching a font that no rendered element uses.

Google/Bing meta verification values are optional URL-prefix mechanisms. Search Console Domain verification requires Cloudflare DNS. Owner configuration: [analytics hub](../analytics/README.md).

Limitations: no dynamic provider sitemap enumeration, no authenticated event instrumentation, no IndexNow, no claimed field performance improvement without measurements. Production/staging ingress redirects, access restrictions, external tags and owner account setup require separate verification. Build-time environment changes require rebuilds.

The public /pos introduction is indexed; operational /pos/* routes stay noindex. /pos/contact contains placeholder phone/contact details and is intentionally held from indexing until owner review.
