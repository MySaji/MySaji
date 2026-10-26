const { test } = require('node:test')
const assert = require('node:assert/strict')
const { loadService } = require('./load-service.cjs')
const details = loadService('backend/domain/pos-receipt-details.ts')
const { receiptHtml } = loadService('frontend/lib/receipt-print.ts', { '@/backend/domain/pos-receipt-details': details, qrcode: require('qrcode') })

test('VAT totals add up and thermal slips include the customer and loyalty balance', () => {
  const receipt = { shopName: 'Test shop', saleNumber: '000001', occurredAt: '2026-10-18T09:00:00Z', customerName: '<Customer>', customerPhone: '+254712345678', lines: [], subtotal: 1160, discount: 0, tax: 160, taxRate: 16, total: 1160, payments: [], amountPaid: 1160, change: 0, loyalty: { earned: 11, redeemed: 5, balance: 106 } }
  const html = receiptHtml(receipt)
  assert.match(html, /Amount excl\. VAT.*1,000\.00/)
  assert.match(html, /VAT 16%.*160\.00/)
  assert.match(html, /Points added.*11/)
  assert.match(html, /Points redeemed.*5/)
  assert.match(html, /Total points.*106/)
  assert.match(html, /Customer phone: \+254712345678/)
  assert.match(html, /&lt;Customer&gt;/)
  assert.doesNotMatch(html, /TAX INVOICE/)
  assert.equal(details.receiptVat(1160, 160).net + 160, 1160)
  const plain = receiptHtml({ ...receipt, tax: 0, taxRate: 0, loyalty: null, customerPhone: null })
  assert.doesNotMatch(plain, /Points added|VAT is included/)
})

test('old receipts recover original earned and redeemed points without applying later reversals', () => {
  const loyalty = details.loyaltyFromEntries([{ kind: 'REDEEM', points: -10, balanceAfter: 90 }, { kind: 'EARN', points: 5, balanceAfter: 95 }, { kind: 'REVERSAL', points: -5, balanceAfter: 90 }])
  assert.equal(loyalty.earned, 5)
  assert.equal(loyalty.redeemed, 10)
  assert.equal(loyalty.balance, 95)
  assert.equal(details.loyaltyFromEntries([]), null)
})

test('receipt reprints use the issued VAT and points snapshot rather than current settings', async () => {
  const snapshot = { version: 1, taxRate: 16, taxInclusive: true, customerPhone: '+254712345678', loyalty: { earned: 11, redeemed: 0, balance: 111 } }
  const db = {
    shopkeeperProfile: { findUnique: async () => ({ id: 'shop', shopName: 'Shop', posEnabled: true }) },
    posSale: { findFirst: async () => ({ id: 'sale', saleNumber: '1', occurredAt: new Date(), subtotal: 1160, discount: 0, tax: 160, total: 1160, amountPaid: 1160, changeGiven: 0, customerName: 'Member', customerPhone: null, items: [], payments: [] }) },
    posAuditEvent: { findFirst: async query => { assert.equal(query.where.entityId, 'sale'); assert.equal(query.where.businessId, 'business'); return { detail: snapshot } } },
  }
  const { getPosReceipt } = loadService('backend/actions/pos-sales.ts', {
    "@/backend/domain/pos-mpesa": loadService("backend/domain/pos-mpesa.ts"),
    "@/backend/services/pos-mpesa-claims": {},
    zod: require('zod'), bcryptjs: {}, crypto: require('node:crypto'),
    '@/backend/domain/pos-receipt-details': details,
    '@/backend/services/pos-access-core': { requirePosPermission: async () => ({ ok: true, actor: { businessId: 'business', storeId: 'store', staffId: null } }) },
    '@/backend/auth': { auth: async () => ({ user: { id: 'owner', role: 'provider' } }) },
    '@/backend/db': { db }, '@/backend/services/pos-tenant': { posShopIdFor: async () => 'shop' },
    '@/backend/services/pos-ledger': {}, '@/backend/services/pos-approval': {}, '@/backend/domain/pos-pricing': {},
    '@/backend/domain/pos-config': { parsePosConfig: () => ({ taxRate: 8, taxInclusive: false }) },
    '@/backend/actions/pos-mpesa': {}, '@/backend/services/etims-queue-core': {}, '@/backend/actions/pos-billing-shop': {}, '@/backend/domain/pos-profiles': { effectiveTraits: () => [] },
  })
  const receipt = await getPosReceipt('sale')
  assert.equal(receipt.taxRate, 16)
  assert.equal(receipt.taxInclusive, true)
  assert.equal(receipt.loyalty.balance, 111)
  assert.equal(receipt.customerPhone, '+254712345678')
})
