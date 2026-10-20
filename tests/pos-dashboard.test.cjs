const { test } = require("node:test")
const assert = require("node:assert/strict")
const { loadService } = require("./load-service.cjs")

function dashboard(canSeeMoney = true) {
  const queries = []
  const sale = { id: "sale", saleNumber: "POS-001", total: 9876.54, status: "COMPLETED", occurredAt: new Date(), customerId: "customer", customerPhone: null, paymentMethod: "CASH", cashierName: "Alex", _count: { items: 2 } }
  const db = {
    shopkeeperProfile: { findUnique: async () => ({ shopName: "Test Shop" }) },
    posSale: { findMany: async query => {
      queries.push(query)
      const range = query.where.occurredAt
      return !range || (sale.occurredAt >= range.gte && (!range.lt || sale.occurredAt < range.lt)) ? [sale] : []
    } },
    inventory: { findMany: async () => [] },
    posSaleItem: { groupBy: async () => [{ productId: "product", name: "Rice", _sum: { quantity: 2, totalPrice: 9876.54 } }] },
    tillSession: { findFirst: async () => null },
    productBatch: { findMany: async () => [] },
  }
  const actions = loadService("backend/actions/pos-dashboard.ts", {
    zod: require("zod"), "@/backend/db": { db },
    "@/backend/services/pos-access-core": { requirePosPermission: async () => ({ ok: true, actor: { shopkeeperId: "my-store", role: "CASHIER", can: () => canSeeMoney } }) },
  })
  return { ...actions, queries }
}

test("Overview supports seven and thirty day charts with zero-sale days included", async () => {
  const { getPosDashboard, queries } = dashboard()
  const week = await getPosDashboard({ days: 7 })
  const month = await getPosDashboard({ days: 30 })
  assert.equal(week.trend.length, 7)
  assert.equal(month.trend.length, 30)
  assert.equal(month.periodDays, 30)
  assert.equal(month.trend.reduce((sum, day) => sum + day.total, 0), 9876.54)
  assert.ok(queries.every(query => query.where.shopkeeperId === "my-store"))
  assert.equal(await getPosDashboard({ days: 365 }), null)
})

test("Overview keeps revenue and product totals out of an unauthorized employee payload", async () => {
  const { getPosDashboard } = dashboard(false)
  const data = await getPosDashboard({ days: 30 })
  assert.equal(data.canSeeMoney, false)
  assert.equal(data.trend.length, 0)
  assert.equal(data.topProducts.length, 0)
  assert.equal(data.stats.some(stat => stat.kind === "money"), false)
  assert.equal(data.recentSales[0].total, 0)
  assert.equal(JSON.stringify(data).includes("9876.54"), false)
})
