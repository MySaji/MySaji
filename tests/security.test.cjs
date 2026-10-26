const { test } = require("node:test")
const assert = require("node:assert/strict")
const { loadService } = require("./load-service.cjs")

test("payment simulation requires explicit opt-in and never works in production", () => {
  const { paymentSimulationAllowed } = loadService("backend/domain/payment-simulation.ts")
  assert.equal(paymentSimulationAllowed({ NODE_ENV: "production", ALLOW_PAYMENT_SIMULATION: "true" }), false)
  assert.equal(paymentSimulationAllowed({ NODE_ENV: "development" }), false)
  assert.equal(paymentSimulationAllowed({ NODE_ENV: "development", ALLOW_PAYMENT_SIMULATION: "true" }), true)
})

test("login proofs are hashed, user-bound, expire, and cannot be replayed", async () => {
  const tokens = []
  const db = { verificationToken: {
    create: async ({ data }) => { tokens.push(data) },
    deleteMany: async ({ where }) => {
      const i = tokens.findIndex(t => t.identifier === where.identifier && t.token === where.token && t.expires > where.expires.gt)
      if (i < 0) return { count: 0 }
      tokens.splice(i, 1); return { count: 1 }
    },
  } }
  const { issueLoginProof, consumeLoginProof } = loadService("backend/services/login-proof.ts", { "@/backend/db": { db } })
  assert.equal(await consumeLoginProof("alice", undefined), false)
  const proof = await issueLoginProof("alice")
  assert.notEqual(tokens[0].token, proof)
  assert.equal(await consumeLoginProof("bob", proof), false)
  assert.equal(await consumeLoginProof("alice", proof), true)
  assert.equal(await consumeLoginProof("alice", proof), false)
  const expired = await issueLoginProof("alice"); tokens[0].expires = new Date(0)
  assert.equal(await consumeLoginProof("alice", expired), false)
})

test("knowledge articles have unique routes, substantive content and valid related links", () => {
  const { GUIDES } = loadService("backend/domain/knowledge.ts")
  const slugs = new Set(GUIDES.map(g => g.slug))
  assert.equal(slugs.size, GUIDES.length)
  assert.ok(GUIDES.length >= 22)
  for (const g of GUIDES) {
    assert.ok(g.sections.length >= 2)
    for (const section of g.sections) assert.ok(section.body.length > 40)
    for (const related of g.related) assert.ok(slugs.has(related), related)
  }
})

test("POS configuration gates distinguish cashier, manager, and accountant", () => {
  const { roleCan } = loadService("backend/domain/pos-permissions.ts")
  assert.equal(roleCan("CASHIER", "settings.store"), false)
  assert.equal(roleCan("ACCOUNTANT", "till.sell"), false)
  assert.equal(roleCan("MANAGER", "settings.store"), true)
  assert.equal(roleCan("OWNER", "settings.store"), true)
})

test("the actual credentials authorizer refuses password-only login", async () => {
  let configuration
  const db = { user: { findFirst: async () => ({ id: "alice", password: "hashed", role: "CUSTOMER", deletedAt: null }) } }
  const NextAuth = options => { configuration = options; return { handlers: {}, auth: async () => null } }
  loadService("backend/auth.ts", {
    "@/backend/services/sms": { normalizeKenyanPhone: value => value },
    "@/backend/domain/session-policy": loadService("backend/domain/session-policy.ts"),
    "next-auth": { __esModule: true, default: NextAuth, CredentialsSignin: class extends Error {} },
    "next-auth/providers/credentials": { __esModule: true, default: value => value },
    "next-auth/providers/google": { __esModule: true, default: value => value },
    "@auth/prisma-adapter": { PrismaAdapter: () => ({}) }, "next/headers": { cookies: async () => ({ get: () => undefined }) },
    "@/backend/db": { db }, "@/backend/services/password": { verifyPassword: async () => true },
    "@/backend/services/role-map": { ROLE_DB_TO_APP: { CUSTOMER: "customer" }, ROLE_APP_TO_DB: {} },
    "@/backend/domain/provider-slug": { buildProviderSlug: () => "" },
    "@/backend/services/rate-limit": { checkRateLimit: async () => ({ allowed: true }) },
    "@/backend/services/login-proof": { consumeLoginProof: async (_id, proof) => proof === "verified-proof" },
  })
  assert.equal(configuration.session.maxAge, 12 * 60 * 60)
  const now = Date.now()
  assert.equal(await configuration.callbacks.jwt({ token: { id: "alice", sessionStartedAt: now - 13 * 3600000, lastActivityAt: now }, trigger: "update", session: { userActivity: true, sessionStartedAt: now } }), null)
  assert.equal(await configuration.callbacks.jwt({ token: { id: "alice", sessionStartedAt: now - 2 * 3600000, lastActivityAt: now - 3600001 }, trigger: "update", session: { userActivity: true } }), null)
  const authorize = configuration.providers[0].authorize
  assert.equal(await authorize({ identifier: "alice@example.invalid", password: "valid" }), null)
  assert.equal((await authorize({ identifier: "alice@example.invalid", password: "valid", otpProof: "verified-proof" })).id, "alice")
})

test("offline scopes change with the store and become inaccessible after sign-out", async () => {
  const values = new Map()
  let serverScope = { userId: "alice", shopId: "store-a" }
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
  const offline = loadService("frontend/lib/pos-offline-scope.ts", {
    "@/backend/actions/pos-offline-context": { getPosOfflineContext: async () => serverScope },
  }, { window: {}, localStorage: storage })
  await offline.initializeOfflineScope("alice")
  assert.equal(offline.offlineScope().shopId, "store-a")
  serverScope = { userId: "alice", shopId: "store-b" }
  await offline.initializeOfflineScope("alice")
  assert.equal(offline.offlineScope().shopId, "store-b")
  offline.suspendOfflineScope()
  assert.equal(offline.offlineScope(), null)
  await offline.initializeOfflineScope("bob")
  assert.equal(offline.offlineScope(), null)
})


test("gateway amounts reject underpayment, wrong currency, and non-finite totals", () => {
  const { matchesGatewayAmount } = loadService("backend/domain/payment-verification.ts")
  const expected = { amount: 12.34, currency: "USD" }
  assert.equal(matchesGatewayAmount(expected, { amount: 12.34, currency: "usd" }), true)
  assert.equal(matchesGatewayAmount(expected, { amount: 1.23, currency: "USD" }), false)
  assert.equal(matchesGatewayAmount(expected, { amount: 12.34, currency: "KES" }), false)
  assert.equal(matchesGatewayAmount(expected, { amount: NaN, currency: "USD" }), false)
})

test("serialization conflicts retry within a bounded limit", async () => {
  const { Prisma } = require("@prisma/client")
  let attempts = 0
  const db = { $transaction: async (run, options) => {
    assert.equal(options.isolationLevel, "Serializable")
    attempts++
    if (attempts < 3) throw new Prisma.PrismaClientKnownRequestError("conflict", { code: "P2034", clientVersion: "6.19.3" })
    return run({ marker: "transaction" })
  } }
  const { serialTransaction } = loadService("backend/services/db-transaction.ts", { "@/backend/db": { db } })
  assert.equal(await serialTransaction(async tx => tx.marker), "transaction")
  assert.equal(attempts, 3)
  attempts = 0
  db.$transaction = async () => { attempts++; throw new Prisma.PrismaClientKnownRequestError("conflict", { code: "P2034", clientVersion: "6.19.3" }) }
  await assert.rejects(() => serialTransaction(async () => "never"))
  assert.equal(attempts, 4)
})
