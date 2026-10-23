const { test } = require('node:test')
const assert = require('node:assert/strict')
const { loadService } = require('./load-service.cjs')

function activation({ verified = true, invited = true, claimed = true } = {}) {
  const writes = []
  const action = loadService('backend/actions/pos-employee.ts', {
    zod: require('zod'), bcryptjs: { hash: async () => 'hashed-password' },
    '@/backend/services/rate-limit': { checkRateLimit: async () => ({ allowed: true }) },
    '@/backend/db': { db: {
      verificationToken: { findFirst: async query => { assert.equal(query.where.identifier, 'signup-verified:employee@example.com'); return verified ? {} : null } },
      $transaction: async callback => callback({
        verificationToken: { deleteMany: async () => ({ count: 1 }) },
        posStaff: {
          findFirst: async query => { assert.equal(query.where.email.equals, 'employee@example.com'); assert.equal(query.where.userId, null); return invited ? { id: 'seat' } : null },
          updateMany: async query => { writes.push(query); return { count: claimed ? 1 : 0 } },
        },
        user: { create: async query => { writes.push(query); return { id: 'employee' } } },
      }),
    } },
  })
  return { ...action, writes }
}
const input = { name: 'Employee', email: 'Employee@example.com', password: 'Password123', agreeTerms: true, verificationProof: 'verified-token' }

test('employee signup requires a verified invited email and creates no business or shop', async () => {
  const f = activation()
  assert.equal((await f.createPosEmployeeAccount(input)).success, true)
  assert.equal(f.writes[0].data.email, 'employee@example.com')
  assert.equal(f.writes[0].data.phone, undefined)
  assert.equal(f.writes[0].data.posBusiness, undefined)
  assert.equal(f.writes[1].where.userId, null)
  assert.equal(f.writes[1].data.userId, 'employee')
})

test('unverified, uninvited and concurrently claimed seats cannot activate access', async () => {
  for (const options of [{ verified: false }, { invited: false }, { claimed: false }]) {
    assert.equal((await activation(options).createPosEmployeeAccount(input)).success, false)
  }
})

test('inventory mutations authorize the exact operation before reading or writing store data', async () => {
  const checked = []
  const actions = loadService('backend/actions/pos-stock.ts', {
    zod: require('zod'), '@/backend/db': { db: {} },
    '@/backend/services/pos-access-core': { requirePosPermission: async permission => { checked.push(permission); return { ok: false } } },
    '@/backend/services/pos-ledger': {}, '@/backend/domain/pos-config': {}, '@/backend/domain/pos-profiles': {},
  })
  for (const [action, permission] of [['receiveStock', 'stock.receive'], ['recordWastage', 'stock.write_off'], ['recordStockCount', 'stock.count'], ['saveProductVariant', 'product.edit']]) {
    assert.equal((await actions[action]({})).success, false)
    assert.equal(checked.at(-1), permission)
  }
})

test('owner can revoke every feature without restoring cashier defaults; managers cannot change access', async () => {
  const permissions = loadService('backend/domain/pos-permissions.ts')
  let role = 'OWNER', written
  const { saveTeamMember } = loadService('backend/actions/pos-team.ts', {
    zod: require('zod'), '@/backend/domain/pos-permissions': permissions,
    '@/backend/services/pos-access-core': { requirePosPermission: async () => ({ ok: true, actor: { businessId: 'b', role } }), recordPosAudit: async () => {} },
    '@/backend/db': { db: { posStaff: { findFirst: async () => null, create: async query => { written = query.data; return { id: 'seat' } } } } },
  })
  const member = { name: 'Employee', role: 'CASHIER', email: 'employee@example.com', features: [], customised: true }
  assert.equal((await saveTeamMember(member)).success, true)
  assert.equal(written.features[0], '__NONE__')
  role = 'MANAGER'; written = null
  assert.equal((await saveTeamMember(member)).success, false)
  assert.equal(written, null)
})

test('an empty custom seat and a closed branch do not inherit role access', async () => {
  const permissions = loadService('backend/domain/pos-permissions.ts')
  let active = true
  const { resolvePosActor } = loadService('backend/services/pos-access-core.ts', {
    '@/backend/services/active-user': { activeUser: async () => ({ id: 'employee', name: 'Employee' }) },
    '@/backend/domain/pos-permissions': permissions,
    '@/backend/db': { db: { posBusiness: { findUnique: async () => null }, posStaff: { findFirst: async () => ({ id: 'seat', role: 'CASHIER', name: 'Employee', features: ['__NONE__'], business: { id: 'b', name: 'Shop' }, store: { id: 's', shopkeeperId: 'shop', isActive: active } }) } } },
  })
  const actor = await resolvePosActor()
  assert.equal(actor.can('till.sell'), false)
  active = false
  assert.equal(await resolvePosActor(), null)
})

test('employees land in an assigned workspace instead of owner setup or an unauthorized register', async () => {
  let grants = []
  const { posDestination } = loadService('backend/actions/pos-onboarding.ts', {
    zod: require('zod'), bcryptjs: {},
    '@/backend/auth': { auth: async () => ({ user: { id: 'employee' } }) },
    '@/backend/db': { db: { posBusiness: { findUnique: async () => null } } },
    '@/backend/services/pos-website-provision': {}, '@/backend/domain/pos-website': {}, '@/backend/services/pos-billing': {}, '@/backend/services/pos-provision': {}, '@/backend/services/signup-proof': {}, '@/backend/services/rate-limit': {}, '@/backend/domain/pos-profiles': {}, '@/backend/domain/pos-onboarding-steps': {},
    '@/backend/services/pos-access-core': { resolvePosActor: async () => ({ can: p => grants.includes(p) }) },
    '@/backend/services/pos-website-provision': { ensureBusinessWebsite: async () => { assert.fail('Employee routing must not provision an owner website') } },
  })
  for (const [permissions, destination] of [[['till.sell'], '/pos/sell'], [['stock.view', 'product.create'], '/pos/stock'], [['report.sales'], '/pos/reports'], [[], '/pos/home']]) {
    grants = permissions
    assert.equal(await posDestination(), destination)
  }
})
