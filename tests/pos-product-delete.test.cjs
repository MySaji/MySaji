const { test } = require('node:test')
const assert = require('node:assert/strict')
const { loadService } = require('./load-service.cjs')

function fixture({ allowed = true, eligible = ['one'], fail = false } = {}) {
  const queries = [], audits = []
  let writes = 0
  const tx = { product: {
    findMany: async query => { queries.push(query); return eligible.map(id => ({ id })) },
    deleteMany: async query => { if (fail) throw Error('concurrent update'); writes++; queries.push(query); return { count: eligible.length } },
  } }
  const { deleteTillProducts } = loadService('backend/actions/pos-product-delete.ts', {
    zod: require('zod'),
    '@/backend/db': { db: { $transaction: async (callback, options) => { assert.equal(options.isolationLevel, 'Serializable'); return callback(tx) } } },
    '@/backend/services/pos-access-core': {
      requirePosPermission: async permission => { assert.equal(permission, 'product.edit'); return allowed ? { ok: true, actor: { shopkeeperId: 'current-store', name: 'Owner' } } : { ok: false, error: 'Not permitted' } },
      recordPosAudit: async event => audits.push(event),
    },
  })
  return { deleteTillProducts, queries, audits, writes: () => writes }
}

test('deletion requires permission and valid selection', async () => {
  const denied = fixture({ allowed: false })
  assert.equal((await denied.deleteTillProducts({ productIds: ['one'] })).success, false)
  assert.equal(denied.queries.length, 0)
  const valid = fixture()
  for (const productIds of [[], [''], Array(201).fill('one')]) assert.equal((await valid.deleteTillProducts({ productIds })).success, false)
  assert.equal(valid.queries.length, 0)
})

test('deletion is store scoped and guards stock and every business relation', async () => {
  const f = fixture()
  const result = await f.deleteTillProducts({ productIds: ['one', 'one'] })
  assert.equal(result.deleted, 1)
  const where = f.queries[1].where
  assert.equal(where.shopkeeperId, 'current-store')
  assert.equal(where.totalSold, 0)
  assert.equal(where.OR[1].inventory.is.reservedStock, 0)
  for (const relation of ['stockMovements', 'posSaleItems', 'orderItems', 'posCountLines', 'posTransferLines', 'variants', 'batches', 'serials', 'posQuoteLines', 'posJobLines', 'posPromotions']) assert.ok(where[relation].none)
  assert.equal(f.audits[0].action, 'product.delete')
})

test('mixed selections and concurrent changes do not report partial deletion', async () => {
  const mixed = fixture()
  assert.equal((await mixed.deleteTillProducts({ productIds: ['one', 'other-store-or-used'] })).success, false)
  assert.equal(mixed.writes(), 0)
  const concurrent = fixture({ fail: true })
  assert.equal((await concurrent.deleteTillProducts({ productIds: ['one'] })).success, false)
  assert.equal(concurrent.audits.length, 0)
})
