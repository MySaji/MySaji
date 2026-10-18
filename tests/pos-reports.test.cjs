const { test } = require('node:test')
const assert = require('node:assert/strict')
const { loadService } = require('./load-service.cjs')
const reporting = loadService('backend/domain/pos-reporting.ts')

test('sales trends fill zero-sale days and preserve daily amounts and counts', () => {
  const trend = reporting.reportTrend([{ day: '2026-10-17', amount: 400, count: 2 }], '2026-10-16T00:00:00Z', '2026-10-18T15:00:00Z')
  assert.equal(trend.length, 3)
  assert.equal(trend[0].amount, 0)
  assert.equal(trend[1].amount, 400)
  assert.equal(trend[1].count, 2)
  assert.equal(trend[2].day, '2026-10-18')
  assert.equal(reporting.reportTrend([], 'invalid', 'invalid').length, 0)
})

function fixture({ allowed = true, margin = true } = {}) {
  const queries = []
  const completed = [
    { id: 'sale', total: 300, status: 'COMPLETED', balanceDue: 0, occurredAt: new Date(), cashierName: 'Alex', payments: [{ method: 'CASH', amount: 100 }, { method: 'MPESA', amount: 200 }], items: [{ name: 'Rice', unit: 'kg', quantity: 2, totalPrice: 200, costAtSale: 60 }, { name: 'Rice', unit: 'piece', quantity: 1, totalPrice: 100, costAtSale: null }] },
    { id: 'deposit', total: 1000, status: 'DEPOSIT', balanceDue: 800, occurredAt: new Date(), cashierName: 'Jamie', payments: [{ method: 'MPESA', amount: 200 }], items: [{ name: 'Table', unit: 'piece', quantity: 1, totalPrice: 1000, costAtSale: 500 }] },
  ]
  const db = {
    shopkeeperProfile: { findUnique: async () => ({ id: 'current-store', shopName: 'Test store', posEnabled: true }) },
    posSale: {
      findMany: async query => { queries.push(query); return completed },
      aggregate: async query => { queries.push(query); return { _count: 1, _sum: { total: 50 } } },
    },
  }
  const actions = loadService('backend/actions/pos-reports.ts', {
    zod: require('zod'), '@/backend/db': { db },
    '@/backend/auth': { auth: async () => ({ user: { id: 'u', role: 'provider' } }) },
    '@/backend/services/pos-tenant': { posShopIdFor: async () => 'current-store' },
    '@/backend/domain/pos-reporting': reporting,
    '@/backend/services/pos-access-core': { resolvePosActor: async () => ({ can: () => allowed }), requirePosPermission: async permission => { assert.equal(permission, 'report.sales'); return allowed ? { ok: true, actor: { can: permission => permission === 'report.margin' && margin } } : { ok: false } } },
  })
  return { ...actions, queries }
}

test('reports retain deposit and split-tender semantics, cost coverage and product units', async () => {
  const f = fixture()
  const report = await f.getTillReport({ range: '7d' })
  assert.equal(report.takings, 500)
  assert.equal(report.saleCount, 2)
  assert.equal(report.averageSale, 250)
  assert.equal(report.grossMargin, 80)
  assert.equal(report.costCoverage, 0.5)
  assert.equal(report.topProducts.length, 2)
  assert.equal(report.itemsSold, 3)
  assert.equal(report.byMethod.find(row => row.method === 'MPESA').amount, 400)
  assert.equal(report.voidedValue, 50)
  assert.equal(report.limited, false)
  for (const query of f.queries) {
    assert.equal(query.where.shopkeeperId, 'current-store')
    assert.ok(query.where.occurredAt.lte instanceof Date)
  }
})

test('report permissions block sales data and omit unauthorized margins', async () => {
  const denied = fixture({ allowed: false })
  assert.equal(await denied.getTillReport({ range: 'today' }), null)
  assert.equal(denied.queries.length, 0)
  const salesOnly = await fixture({ margin: false }).getTillReport({ range: 'today' })
  assert.equal(salesOnly.canSeeMargin, false)
  assert.equal(salesOnly.grossMargin, null)
  assert.equal(salesOnly.costCoverage, 0)
})
