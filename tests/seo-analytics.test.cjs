const { test } = require("node:test")
const assert = require("node:assert/strict")
const { loadService } = require("./load-service.cjs")
const { GUIDES } = loadService("backend/domain/knowledge.ts")
const seo = loadService("frontend/lib/seo.ts", { "@/backend/domain/knowledge": { GUIDES } }, { URL })
test("sitemap covers real guides once, with absolute canonical URLs and no account routes", () => {
  const sitemap = loadService("app/sitemap.ts", { "@/frontend/lib/seo": seo }).default()
  assert.equal(sitemap.length, GUIDES.length + 5)
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
