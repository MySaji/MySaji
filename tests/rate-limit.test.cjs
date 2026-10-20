const { test } = require("node:test")
const assert = require("node:assert/strict")
const { loadService } = require("./load-service.cjs")

function limiter(attempts) {
  const events = []
  const tx = {
    $queryRaw: async (strings, ...values) => {
      assert.match(strings.join("?"), /pg_advisory_xact_lock\(hashtext\(\?\), hashtext\(\?\)\)::text/)
      assert.deepEqual(values, ["login_otp", "user@example.com"])
      events.push("lock")
      return [{ lock_result: "" }]
    },
    rateLimitAttempt: {
      findMany: async () => { events.push("read"); return attempts },
      create: async () => { events.push("record") },
    },
  }
  const { checkRateLimit } = loadService("backend/services/rate-limit.ts", {
    "@/backend/db": { db: { $transaction: async callback => callback(tx) } },
    "next/headers": { headers: async () => ({ get: () => null }) },
  })
  return { checkRateLimit, events }
}

test("OTP rate limit acquires a Prisma-readable lock before recording an attempt", async () => {
  const { checkRateLimit, events } = limiter([])
  assert.equal((await checkRateLimit("user@example.com", "login_otp", 3, 60_000)).allowed, true)
  assert.deepEqual(events, ["lock", "read", "record"])
})

test("OTP rate limit still rejects a full bucket without recording another attempt", async () => {
  const { checkRateLimit, events } = limiter(Array.from({ length: 3 }, () => ({ createdAt: new Date() })))
  const result = await checkRateLimit("user@example.com", "login_otp", 3, 60_000)
  assert.equal(result.allowed, false)
  assert.ok(result.retryAfterSeconds > 0 && result.retryAfterSeconds <= 60)
  assert.deepEqual(events, ["lock", "read"])
})
