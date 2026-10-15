const { test } = require("node:test")
const assert = require("node:assert/strict")
const { randomUUID } = require("node:crypto")
const { PrismaClient } = require("@prisma/client")
const { loadService } = require("./load-service.cjs")
const url = process.env.SAJI_TEST_DATABASE_URL

test("PostgreSQL: concurrent callbacks credit once, concurrent credits preserve balance, and failures roll back", { skip: !url }, async () => {
  const target = new URL(url)
  assert.ok(["localhost", "127.0.0.1"].includes(target.hostname), "Integration tests require a local disposable database")
  assert.match(target.pathname, /_(test|ci)$/)
  const db = new PrismaClient({ datasourceUrl: url })
  const userId = `test-${randomUUID()}`
  const transaction = loadService("backend/services/db-transaction.ts", { "@/backend/db": { db } })
  const wallet = loadService("backend/services/wallet-atomic.ts", {
    "@/backend/db": { db }, "@/backend/services/db-transaction": transaction,
    "@/backend/services/notifications-core": { notifyUser: async () => {} },
    "@/backend/services/receipts-core": { createAndEmailReceipt: async () => {} },
  })
  try {
    await db.user.create({ data: { id: userId, name: "Test user", email: `${userId}@example.invalid`, wallet: { create: {} } } })
    const payment = await db.payment.create({ data: { payerId: userId, amount: 100, contextType: "WALLET_TOPUP" } })
    await Promise.all(Array.from({ length: 4 }, () => wallet.confirmWalletTopup(payment.id, "Test")))
    assert.equal(Number((await db.wallet.findUniqueOrThrow({ where: { userId } })).balance), 100)
    assert.equal(await db.transaction.count({ where: { referenceId: payment.id } }), 1)
    await Promise.all([wallet.creditWalletTopup(userId, 20, "Test"), wallet.creditWalletTopup(userId, 30, "Test")])
    assert.equal(Number((await db.wallet.findUniqueOrThrow({ where: { userId } })).balance), 150)
    const failed = await db.payment.create({ data: { payerId: userId, amount: -1, contextType: "WALLET_TOPUP" } })
    await assert.rejects(() => wallet.confirmWalletTopup(failed.id))
    assert.equal((await db.payment.findUniqueOrThrow({ where: { id: failed.id } })).status, "PENDING")
    const { payWithWallet } = loadService("backend/services/wallet-payment.ts", { "@/backend/services/db-transaction": transaction })
    const attempts = await Promise.allSettled([payWithWallet({ userId, amount: 100 }), payWithWallet({ userId, amount: 100 })])
    assert.equal(attempts.filter(r => r.status === "fulfilled").length, 1)
    assert.equal(Number((await db.wallet.findUniqueOrThrow({ where: { userId } })).balance), 50)
  } finally {
    await db.payment.deleteMany({ where: { payerId: userId } })
    await db.user.deleteMany({ where: { id: userId } })
    await db.$disconnect()
  }
})
