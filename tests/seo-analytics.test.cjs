const { test } = require("node:test")
const assert = require("node:assert/strict")
const { loadService } = require("./load-service.cjs")
const { GUIDES } = loadService("backend/domain/knowledge.ts")
const publicSite = loadService("backend/domain/public-site.ts")
const seo = loadService("frontend/lib/seo.ts", { "@/backend/domain/knowledge": { GUIDES }, "@/backend/domain/public-site": publicSite }, { URL })
test("sitemap covers real guides once, with absolute canonical URLs and no account routes", () => {
  const sitemap = loadService("app/sitemap.ts", { "@/frontend/lib/seo": seo }).default()
  assert.equal(sitemap.length, GUIDES.length + 5 + publicSite.OFFERING_SLUGS.length)
  assert.equal(new Set(sitemap.map(x => x.url)).size, sitemap.length)
  for (const item of sitemap) {
    assert.equal(new URL(item.url).origin, seo.siteUrl)
    assert.ok(seo.publicPaths.includes(new URL(item.url).pathname))
    assert.ok(!/\/(auth|customer|provider|admin|till)(\/|$)/.test(new URL(item.url).pathname))
    assert.ok(!new URL(item.url).pathname.startsWith("/pos/"))
  }
})
test("robots permits public crawling and advertises the same sitemap", () => {
  const robots = loadService("app/robots.ts", { "@/frontend/lib/seo": seo }).default()
  assert.equal(robots.rules.userAgent, "*")
  assert.equal(robots.rules.allow, "/")
  assert.equal(robots.sitemap, `${seo.siteUrl}/sitemap.xml`)
})
test("public metadata overrides private default and shares canonical/social URL", () => {
  const m = seo.pageMetadata("/knowledge", "Knowledge", "Verified guides")
  assert.equal(m.robots.index, true)
  assert.equal(m.alternates.canonical, `${seo.siteUrl}/knowledge`)
  assert.equal(m.openGraph.url, m.alternates.canonical)
  assert.equal(m.twitter.description, m.description)
  assert.equal(m.title.absolute, "Knowledge | MySaji")
  assert.equal(m.openGraph.siteName, "MySaji")
  assert.equal(m.openGraph.images[0].url, "https://mysaji.com/icon-512.png")
})

test("public offering links resolve to unique substantive pages or the existing Learn/Till hubs", () => {
  const { PUBLIC_OFFERINGS } = loadService("backend/domain/public-offerings.ts")
  assert.equal(new Set(PUBLIC_OFFERINGS.map(page => page.slug)).size, 5)
  const titles = new Set(), descriptions = new Set(), headings = new Set()
  for (const page of PUBLIC_OFFERINGS) {
    assert.ok(publicSite.OFFERING_SLUGS.includes(page.slug))
    assert.ok(seo.publicPaths.includes(`/${page.slug}`))
    assert.ok(page.features.length >= 4 && page.steps.length >= 4)
    assert.ok(page.intro.length > 100)
    for (const guide of page.guides) assert.ok(GUIDES.some(item => item.slug === guide))
    for (const related of page.related) assert.ok(publicSite.OFFERING_SLUGS.includes(related))
    titles.add(page.title); descriptions.add(page.description); headings.add(page.heading)
  }
  assert.equal(titles.size, 5); assert.equal(descriptions.size, 5); assert.equal(headings.size, 5)
  for (const link of publicSite.OFFERING_LINKS) assert.ok(seo.publicPaths.includes(link.href))
  assert.equal(publicSite.OFFERING_LINKS.find(link => link.shortLabel === "Learn").href, "/knowledge")
  assert.equal(seo.publicPaths.includes("/learn"), false)
})

test("WebSite and breadcrumb JSON-LD use canonical production URLs and safe serialization", () => {
  assert.equal(seo.websiteStructuredData.name, "MySaji")
  assert.equal(seo.websiteStructuredData.url, "https://mysaji.com/")
  assert.equal(seo.websiteStructuredData.potentialAction, undefined)
  const breadcrumbs = seo.breadcrumbStructuredData([{label:"MySaji home",href:"/"},{label:"Shop",href:"/shop"}])
  assert.equal(breadcrumbs.itemListElement[1].position, 2)
  assert.equal(breadcrumbs.itemListElement[1].item, "https://mysaji.com/shop")
  const serialized = seo.serializeJsonLd({name:"</script><script>alert(1)</script>"})
  assert.equal(serialized.includes("<"), false)
  assert.equal(JSON.parse(serialized).name, "</script><script>alert(1)</script>")
})
test("knowledge analytics denies private paths and never sends free text", () => {
  const pushes = []
  const globals = { location: { pathname: "/knowledge" }, localStorage: { getItem: () => "granted" }, window: { dataLayer: { push: event => pushes.push(event) } } }
  const analytics = loadService("frontend/lib/analytics.ts", { "@/backend/domain/knowledge": { GUIDES } }, globals)
  const old = process.env.NEXT_PUBLIC_GTM_ID
  try {
    process.env.NEXT_PUBLIC_GTM_ID = "GTM-TEST"
    analytics.trackKnowledgeSearch(3)
    assert.equal(pushes.length, 1)
    assert.deepEqual(Object.keys(pushes[0]).sort(), ["event", "result_count", "search_scope"])
    globals.location.pathname = "/customer/search"
    analytics.trackKnowledgeSearch(1)
    assert.equal(pushes.length, 1)
    globals.location.pathname = "/knowledge"
    globals.localStorage.getItem = () => "denied"
    analytics.trackKnowledgeSearch(1)
    assert.equal(pushes.length, 1)
    globals.localStorage.getItem = () => { throw new Error("storage blocked") }
    assert.doesNotThrow(() => analytics.trackKnowledgeSearch(1))
    assert.equal(pushes.length, 1)
    assert.equal(analytics.isTrackedPath("/auth/login"), false)
    assert.equal(analytics.isTrackedPath("/knowledge/not-a-real-guide"), false)
  } finally { if (old === undefined) delete process.env.NEXT_PUBLIC_GTM_ID; else process.env.NEXT_PUBLIC_GTM_ID = old }
})
