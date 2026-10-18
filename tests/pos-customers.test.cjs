const { test } = require('node:test')
const assert = require('node:assert/strict')
const { loadService } = require('./load-service.cjs')
const { customerDirectory } = loadService('backend/domain/pos-customer-directory.ts')
const now = Date.parse('2026-10-18T00:00:00Z')
const rows = [
  { id: 'a', name: 'Alex', isActive: true, visits: 4, totalSpent: 6000, pointsBalance: 60, lastSeenAt: '2026-10-17T00:00:00Z' },
  { id: 'b', name: 'Bea', isActive: true, visits: 1, totalSpent: 400, pointsBalance: 4, lastSeenAt: '2026-08-01T00:00:00Z' },
  { id: 'c', name: 'Cam', isActive: false, visits: 8, totalSpent: 9000, pointsBalance: 90, lastSeenAt: '2026-10-18T00:00:00Z' },
  { id: 'd', name: 'Dee', isActive: true, visits: 0, totalSpent: 0, pointsBalance: 0, lastSeenAt: null },
]

test('customer groups distinguish returning, away, inactive and never-visited members', () => {
  const ids = segment => customerDirectory(rows, segment, 'name', now).map(row => row.id).join()
  assert.equal(ids('returning'), 'a')
  assert.equal(ids('away'), 'b')
  assert.equal(ids('inactive'), 'c')
  assert.equal(ids('active'), 'a,b,d')
})

test('customer sorts use recorded metrics without mutating the source', () => {
  assert.equal(customerDirectory(rows, 'all', 'spent')[0].id, 'c')
  assert.equal(customerDirectory(rows, 'all', 'recent').at(-1).id, 'd')
  assert.equal(customerDirectory(rows, 'all', 'points')[0].id, 'c')
  assert.equal(rows.map(row => row.id).join(), 'a,b,c,d')
})

function fixture(allowed = true) {
  const queries = []
  const actions = loadService('backend/actions/pos-customers.ts', {
    zod: require('zod'),
    '@/backend/db': { db: {
      shopkeeperProfile: { findUnique: async () => ({ posConfig: {} }) },
      posCustomer: { findMany: async query => { queries.push(query); return [] } },
    } },
    '@/backend/domain/pos-config': { parsePosConfig: () => ({ loyaltyEnabled: true, loyaltyShillingsPerPoint: 1 }) },
    '@/backend/services/pos-access-core': { requirePosPermission: async () => allowed ? { ok: true, actor: { shopkeeperId: 'current-store' } } : { ok: false, error: 'Denied' } },
  })
  return { ...actions, queries }
}

test('points-card lookup matches local and international phone formats within the same store', async () => {
  const f = fixture()
  for (const input of ['0712345678', '07 123 45678', '+254712345678', '254712345678', '712345678']) {
    await f.findCustomerForTill({ query: input })
    const where = f.queries.at(-1).where
    assert.equal(where.shopkeeperId, 'current-store')
    assert.equal(where.isActive, true)
    assert.deepEqual(Array.from(where.phone.in), ['+254712345678', '254712345678', '0712345678', '712345678'])
  }
  await f.findCustomerForTill({ query: '0112345678' })
  assert.equal(f.queries.at(-1).where.phone.in[0], '+254112345678')
  for (const query of ['0712', '+254712']) {
    await f.findCustomerForTill({ query })
    assert.equal(f.queries.at(-1).where.OR.at(-1).phone.startsWith, '+254712')
  }
})

test('customer search supports email, normalizes local phone numbers and paginates within the current store', async () => {
  const f = fixture()
  await f.getCustomers({ query: '0712345678', limit: 100, offset: 100 })
  const query = f.queries[0]
  assert.equal(query.where.shopkeeperId, 'current-store')
  assert.equal(query.where.OR[2].phone.contains, '+254712345678')
  assert.equal(query.take, 100)
  assert.equal(query.skip, 100)
  assert.equal(query.orderBy.at(-1).id, 'asc')
  await f.getCustomers({ query: 'mail@example.com' })
  assert.equal(f.queries[1].where.OR[1].email.contains, 'mail@example.com')
})

test('invalid or unauthorized customer queries do not read customer data', async () => {
  const f = fixture()
  await f.getCustomers({ offset: -1 })
  await f.getCustomers({ query: 'x'.repeat(61) })
  assert.equal(f.queries.length, 0)
  const denied = fixture(false)
  await denied.getCustomers({})
  assert.equal(denied.queries.length, 0)
})
