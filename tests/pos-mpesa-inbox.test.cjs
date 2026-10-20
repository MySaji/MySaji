const { test } = require('node:test')
const assert = require('node:assert/strict')
const { loadService } = require('./load-service.cjs')

test('two counters cannot claim the same received payment', async () => {
  const { claimReceivedMpesa } = loadService('backend/services/pos-mpesa-claims.ts')
  let used = false
  const tx = { posMpesaTransaction: { updateMany: async query => {
    assert.equal(query.where.shopkeeperId, 'shop-a')
    assert.equal(query.where.status, 'PAID')
    assert.equal(query.where.consumedSaleId, null)
    assert.equal(query.where.amount, 450)
    if (used) return { count: 0 }
    used = true
    return { count: 1 }
  } } }
  const results = await Promise.allSettled(['sale-a', 'sale-b'].map(saleId => claimReceivedMpesa(tx, { id: 'payment', shopkeeperId: 'shop-a', saleId, amount: 450 })))
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal(results.filter(result => result.status === 'rejected').length, 1)
})

function callbacks({ existing = null, providerConfirmed = true } = {}) {
  const writes = []
  let providerQueries = 0
  let saved = existing
  const pending = { id: 'pending', shopkeeperId: 'shop-a', environment: 'production', shortcode: '123456', source: 'STK', status: 'PENDING', amount: 450, phone: '254712345678', checkoutId: 'checkout-a', callbackTokenHash: 'secret' }
  const tx = {
    $queryRaw: async () => [],
    posMpesaTransaction: {
      findUnique: async () => saved,
      create: async query => { writes.push(query.data); saved = { id: 'received', ...query.data }; return saved },
      update: async query => { writes.push(query); return {} },
    },
  }
  const action = loadService('backend/services/pos-mpesa-callbacks.ts', {
    zod: require('zod'),
    '@/backend/services/pos-mpesa-core': { mpesaTokenHash: token => token, confirmStkQuery: async () => { providerQueries++; return providerConfirmed } },
    '@/backend/db': { db: {
      $transaction: callback => callback(tx),
      posMpesaConnection: { findUnique: async query => query.where.tokenHash === 'secret' ? { shopkeeperId: 'shop-a', shortcode: '123456', environment: 'production', registeredAt: new Date() } : null },
      shopkeeperProfile: { findUnique: async () => ({ posEnabled: true, mpesaShortcode: '123456', mpesaEnv: 'production' }) },
      posMpesaTransaction: { findUnique: async query => query.where.callbackTokenHash === 'secret' ? pending : null, updateMany: async query => { writes.push(query); return { count: 1 } } },
    } },
  })
  return { ...action, writes, providerQueries: () => providerQueries }
}
const c2b = { BusinessShortCode: '123456', TransID: 'ABC123XYZ9', TransAmount: '450.00', MSISDN: '254712345678', BillRefNumber: 'COUNTER1', FirstName: 'Customer' }
const stk = amount => ({ Body: { stkCallback: { CheckoutRequestID: 'checkout-a', ResultCode: 0, CallbackMetadata: { Item: [{ Name: 'Amount', Value: amount }, { Name: 'MpesaReceiptNumber', Value: 'ABC123XYZ9' }, { Name: 'PhoneNumber', Value: 254712345678 }] } } } })

test('C2B callbacks bind the secret and shortcode, and retries do not duplicate money', async () => {
  const f = callbacks()
  assert.equal(await f.receiveC2b('wrong-token', c2b, false), false)
  assert.equal(await f.receiveC2b('secret', { ...c2b, BusinessShortCode: '999999' }, false), false)
  assert.equal(await f.receiveC2b('secret', c2b, true), true)
  assert.equal(f.writes.length, 0)
  assert.equal(await f.receiveC2b('secret', c2b, false), true)
  assert.equal(await f.receiveC2b('secret', c2b, false), true)
  assert.equal(f.writes.length, 1)
  assert.equal(f.writes[0].shopkeeperId, 'shop-a')
  assert.equal(f.writes[0].environment, 'production')
  assert.equal(f.writes[0].amount, 450)
})

test('STK confirmation requires matching amount, phone, request and provider query', async () => {
  const f = callbacks()
  assert.equal(await f.receiveStk('secret', stk(449)), false)
  assert.equal(f.providerQueries(), 0)
  const wrongPhone = stk(450); wrongPhone.Body.stkCallback.CallbackMetadata.Item[2].Value = 254700000000
  assert.equal(await f.receiveStk('secret', wrongPhone), false)
  const unconfirmed = callbacks({ providerConfirmed: false })
  await assert.rejects(unconfirmed.receiveStk('secret', stk(450)))
  assert.equal(unconfirmed.writes.length, 0)
  assert.equal(await f.receiveStk('secret', stk(450)), true)
  assert.equal(f.writes[0].data.status, 'PAID')
  assert.equal(f.writes[0].data.receipt, 'ABC123XYZ9')
})

test('C2B and STK notifications for one receipt merge without making a second payment', async () => {
  const f = callbacks({ existing: { id: 'c2b-payment', shopkeeperId: 'shop-a', amount: 450, consumedSaleId: 'already-matched-sale' } })
  assert.equal(await f.receiveStk('secret', stk(450)), true)
  assert.equal(f.writes.length, 2)
  assert.equal(f.writes[0].data.status, 'MERGED')
  assert.equal(f.writes[1].where.id, 'c2b-payment')
  assert.equal(f.writes[1].data.consumedSaleId, undefined)
})
