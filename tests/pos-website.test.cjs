const { test } = require("node:test")
const assert = require("node:assert/strict")
const { loadService } = require("./load-service.cjs")
const domain = loadService("backend/domain/pos-website.ts", { zod: require("zod") })

test("website addresses normalize names and protect reserved hosts and private routes", () => {
  assert.equal(domain.businessSubdomain("James Bond"), "jamesbond")
  assert.equal(domain.businessSubdomain("Caf\u00e9 & Co"), "cafeco")
  assert.equal(domain.businessSubdomain("admin"), "adminshop")
  assert.equal(domain.tenantFromHost("jamesbond.mysaji.com:3000"), "jamesbond")
  for (const host of ["admin.mysaji.com", "www.mysaji.com", "x.y.mysaji.com", "jamesbond.mysaji.com.evil.org"]) assert.equal(domain.tenantFromHost(host), null)
  for (const path of ["/pos/sell", "/api/auth/session", "/about/secret"]) assert.equal(domain.websiteRoute(path), null)
})

test("provisioning locks the namespace, allocates collision suffixes and keeps an existing address", async () => {
  const rows = [{ id: "one", businessId: "first", subdomain: "jamesbond" }]
  let locks = 0
  const tx = { $queryRaw: async sql => { assert.match(sql[0], /SELECT true AS locked/); locks++ }, posBusinessWebsite: {
    findUnique: async ({ where }) => rows.find(r => where.businessId ? r.businessId === where.businessId : r.subdomain === where.subdomain) || null,
    create: async ({ data }) => { const row = { id: "two", ...data }; rows.push(row); return row },
  } }
  const { ensureBusinessWebsite } = loadService("backend/services/pos-website-provision.ts", { "@/backend/domain/pos-website": domain })
  assert.equal((await ensureBusinessWebsite(tx, { id: "second", name: "James Bond" })).subdomain, "jamesbond-2")
  assert.equal((await ensureBusinessWebsite(tx, { id: "second", name: "Renamed" })).id, "two")
  assert.equal(rows.length, 2); assert.equal(locks, 2)
})

function setup({ primaryFailure = 0 } = {}) {
  let user = { id: "owner", name: "Owner" }, aiCall
  const aiRequests = []
  let site = { subdomain: "jamesbond", businessId: "business", version: 1, draft: domain.starterWebsite("James Bond"), publishedContent: null, publishedAt: null, updatedAt: new Date() }
  const queries = [], audits = []
  const business = { id: "business", name: "James Bond", currency: "KES", profileKey: "retail", stores: [{ id: "branch", shopkeeperId: "shop", phone: "0712345678" }] }
  const db = {
    posBusiness: { findUnique: async ({ where }) => where.ownerUserId === "owner" ? business : null },
    posBusinessWebsite: {
      findUnique: async () => site,
      updateMany: async ({ where, data }) => { if (where.businessId !== site.businessId || where.version !== site.version) return { count: 0 }; site = { ...site, ...data, version: site.version + 1 }; if (data.publishedContent === "DB_NULL") site.publishedContent = null; return { count: 1 } },
      findFirst: async ({ where }) => { queries.push(where); if (where.subdomain !== site.subdomain || (where.business.ownerUserId && where.business.ownerUserId !== "owner") || (where.publishedAt && !site.publishedAt)) return null; return { ...site, business } },
    },
    product: { count: async ({ where }) => where.id.in.filter(id => id === "product").length, findMany: async q => { queries.push(q); return [] } },
    shopkeeperProfile: { findUnique: async () => null },
  }
  const actions = loadService("backend/actions/pos-website.ts", {
    "@prisma/client": { Prisma: { DbNull: "DB_NULL" } }, zod: require("zod"), "@/backend/db": { db },
    "@/backend/services/active-user": { activeUser: async () => user }, "@/backend/services/pos-website-provision": {},
    "@/backend/domain/pos-website": domain, "@/backend/domain/pos-profiles": { resolvePosProfile: () => ({ label: "Retail" }) },
    "@/backend/services/pos-access-core": { recordPosAudit: async e => audits.push(e) },
    "@/backend/services/rate-limit": { checkRateLimit: async () => ({ allowed: true }) },
    "@/backend/services/ai/gemini-client": { getGeminiClient: () => ({ models: { generateContent: async input => { aiCall = input; aiRequests.push(input.model); if (primaryFailure && input.model === (process.env.POS_WEBSITE_MODEL || "gemini-3.6-flash")) throw Object.assign(new Error("Provider failure"), { status: primaryFailure }); return { text: JSON.stringify({ headline: "Meet James Bond", introduction: "A local business in Nairobi welcoming your enquiries.", about: "Our local business welcomes customers in Nairobi. Contact us to discuss your needs.", suggestions: ["Add opening hours."] }) } } } }) },
    "@/backend/services/ai/credentials": { isGeminiConfigured: () => true, noteGeminiFailure: () => {} },
  }, { AbortSignal })
  const publicService = loadService("backend/services/pos-public-website.ts", { "@/backend/db": { db }, "@/backend/services/active-user": { activeUser: async () => user }, "@/backend/domain/pos-website": domain, "@/backend/services/pos-install-brand": { validInstallLogo: () => false } })
  return { ...actions, ...publicService, queries, audits, setUser: v => { user = v }, getSite: () => site, getAi: () => aiCall, aiRequests }
}

test("owner flow preserves private drafts, publishes reviewed snapshots and unpublishes without deleting drafts", async () => {
  const s = setup(), content = { ...domain.starterWebsite("James Bond"), phone: "0712345678", about: "Our local business welcomes customers in Nairobi. Contact us to discuss what you need." }
  assert.equal(await s.loadBusinessWebsite("jamesbond"), null)
  assert.equal((await s.savePosWebsite({ content, version: 1 })).success, true)
  assert.equal(await s.loadBusinessWebsite("jamesbond"), null)
  assert.equal((await s.loadBusinessWebsite("jamesbond", true)).content.phone, content.phone)
  assert.equal((await s.savePosWebsite({ content, version: 2, publish: true })).success, false)
  assert.equal((await s.savePosWebsite({ content, version: 2, publish: true, reviewed: true })).success, true)
  const edit = { ...content, headline: "Private new headline" }
  await s.savePosWebsite({ content: edit, version: 3 })
  assert.equal((await s.loadBusinessWebsite("jamesbond")).content.headline, content.headline)
  assert.equal((await s.loadBusinessWebsite("jamesbond", true)).content.headline, edit.headline)
  assert.equal((await s.savePosWebsite({ content, version: 2 })).success, false)
  assert.equal((await s.unpublishPosWebsite({ version: 4 })).success, true)
  assert.equal(await s.loadBusinessWebsite("jamesbond"), null)
  assert.equal(s.getSite().draft.headline, edit.headline)
  assert.equal(s.audits.at(-1).action, "website.unpublish")
})

test("staff cannot edit, publish, search catalogue, request AI or preview another owner's draft", async () => {
  const s = setup(); s.setUser({ id: "employee" })
  for (const result of [await s.getPosWebsiteEditor(), await s.savePosWebsite({}), await s.unpublishPosWebsite({ version: 1 }), await s.searchPosWebsiteProducts("rice"), await s.suggestPosWebsiteCopy(domain.starterWebsite("James Bond"))]) assert.equal(result.success, false)
  assert.equal(await s.loadBusinessWebsite("jamesbond", true), null)
  assert.equal(s.getAi(), undefined)
})

test("foreign products are rejected and catalogue searches remain scoped to active business products", async () => {
  const s = setup()
  assert.equal((await s.savePosWebsite({ content: { ...domain.starterWebsite("James Bond"), productIds: ["foreign"] }, version: 1 })).success, false)
  await s.searchPosWebsiteProducts("rice")
  const query = s.queries.at(-1)
  assert.equal(query.where.shopkeeperId.in[0], "shop"); assert.equal(query.where.isActive, true); assert.equal(query.take, 100)
})

test("AI receives business copy only and cannot save or publish its response", async () => {
  const s = setup()
  const result = await s.suggestPosWebsiteCopy({ ...domain.starterWebsite("James Bond"), phone: "0712345678", email: "private@example.com" })
  assert.equal(result.success, true)
  const facts = JSON.parse(s.getAi().contents)
  assert.equal(facts.phone, undefined); assert.equal(facts.email, undefined)
  assert.equal(s.getSite().version, 1); assert.equal(s.getSite().publishedAt, null)
})


test("temporary AI overload falls back once but credential errors do not retry", async () => {
  const overloaded = setup({ primaryFailure: 503 })
  assert.equal((await overloaded.suggestPosWebsiteCopy(domain.starterWebsite("James Bond"))).success, true)
  assert.equal(overloaded.aiRequests.length, 2)
  assert.equal(overloaded.aiRequests[1], "gemini-3.5-flash-lite")
  const rejected = setup({ primaryFailure: 403 })
  assert.equal((await rejected.suggestPosWebsiteCopy(domain.starterWebsite("James Bond"))).success, false)
  assert.equal(rejected.aiRequests.length, 1)
})

test("tenant proxy rewrites only public GET pages and blocks account access before authentication", async () => {
  const { NextRequest, NextResponse } = require("next/server")
  let authCalls = 0
  const proxy = loadService("proxy.ts", {
    "next/server": { NextResponse }, "@/backend/domain/pos-website": domain,
    "@/backend/auth": { auth: () => () => { authCalls++; return NextResponse.next() } },
    "@/backend/actions/admin-settings": {},
  }).default
  const request = (host, path, method = "GET") => new NextRequest(`https://${host}${path}`, { method, headers: { host } })
  const result = await proxy(request("jamesbond.mysaji.com", "/about?preview=1"), {})
  assert.equal(result.headers.get("x-middleware-rewrite"), "https://jamesbond.mysaji.com/business/jamesbond/about")
  for (const [path, method] of [["/api/auth/session", "GET"], ["/pos/home", "GET"], ["/contact", "POST"]]) assert.equal((await proxy(request("jamesbond.mysaji.com", path, method), {})).status, 404)
  assert.equal(authCalls, 0)
  await proxy(request("www.mysaji.com", "/"), {})
  assert.equal(authCalls, 1)
})

test("POS signup reserves the website in the account transaction before consuming signup proof", async () => {
  const calls = []
  const tx = {
    user: { create: async () => ({ id: "new-owner" }) },
    shopkeeperProfile: { update: async () => {} },
    posBusiness: { create: async () => { calls.push("business"); return { id: "new-business" } } },
    posStore: { create: async () => { calls.push("store") } },
    posStaff: { create: async () => { calls.push("staff") } },
  }
  const onboarding = loadService("backend/actions/pos-onboarding.ts", {
    zod: require("zod"), bcryptjs: { hash: async () => "hashed" }, "@/backend/auth": {},
    "@/backend/db": { db: { user: { findFirst: async () => null }, $transaction: async callback => { const result = await callback(tx); calls.push("commit"); return result } } },
    "@/backend/services/pos-billing": { ensureSubscription: async () => {} },
    "@/backend/services/pos-provision": { provisionPos: async () => "shop" },
    "@/backend/services/signup-proof": { isSignupProofValid: async () => true, consumeSignupProof: async () => { calls.push("consume-proof") } },
    "@/backend/services/rate-limit": { checkRateLimit: async () => ({ allowed: true }) },
    "@/backend/domain/pos-profiles": {}, "@/backend/services/pos-access-core": {}, "@/backend/domain/pos-onboarding-steps": {},
    "@/backend/domain/pos-website": domain,
    "@/backend/services/pos-website-provision": { ensureBusinessWebsite: async (transaction, business) => { assert.equal(transaction, tx); assert.equal(business.name, "James Bond"); calls.push("website") } },
  })
  const result = await onboarding.createPosAccount({ name: "James", email: "james@example.com", phone: "0712345678", password: "long-password", agreeTerms: true, verificationProof: "verified-proof", businessName: "James Bond" })
  assert.equal(result.success, true)
  assert.equal(calls.join(","), "business,store,website,staff,commit,consume-proof")
})

test("business setup seeds only an untouched private website and excludes tax/account information", async () => {
  let update
  const onboarding = loadService("backend/actions/pos-onboarding.ts", {
    zod: require("zod"), bcryptjs: {}, "@/backend/auth": { auth: async () => ({ user: { id: "owner" } }) },
    "@/backend/db": { db: {
      posBusiness: { findUnique: async () => ({ id: "business", onboardingData: {}, stores: [] }), update: async () => {} },
      posBusinessWebsite: { updateMany: async query => { update = query } },
    } },
    "@/backend/services/pos-billing": {}, "@/backend/services/pos-provision": {}, "@/backend/services/signup-proof": {}, "@/backend/services/rate-limit": {},
    "@/backend/domain/pos-profiles": { resolvePosProfile: () => ({ key: "GENERAL", label: "General shop" }) },
    "@/backend/services/pos-access-core": {}, "@/backend/domain/pos-onboarding-steps": {}, "@/backend/domain/pos-website": domain,
    "@/backend/services/pos-website-provision": {},
  })
  const result = await onboarding.saveBusinessStep({ name: "James Bond", profileKey: "GENERAL", phone: "0712345678", town: "Nairobi", street: "Market Road", taxPin: "PRIVATE-PIN" })
  assert.equal(result.success, true)
  assert.equal(update.where.version, 1); assert.equal(update.where.publishedAt, null)
  assert.equal(update.data.draft.phone, "0712345678")
  assert.equal(update.data.draft.address, "Market Road, Nairobi")
  assert.equal(update.data.draft.taxPin, undefined)
  assert.equal(update.data.draft.email, "")
})
