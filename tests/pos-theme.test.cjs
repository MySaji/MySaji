const { test } = require('node:test')
const assert = require('node:assert/strict')
const { loadService } = require('./load-service.cjs')
const theme = loadService('backend/domain/pos-theme.ts')
const traits = loadService('backend/domain/pos-traits.ts')
const config = loadService('backend/domain/pos-config.ts', { zod: require('zod'), './pos-traits': traits })

test('store colour defaults safely and rejects CSS injection', () => {
  assert.equal(config.parsePosConfig({}).primaryColor, '#2563eb')
  for (const value of ['red', '#fff', '#123456;display:none', 'url(x)']) {
    assert.equal(config.posConfigSchema.safeParse({ primaryColor: value }).success, false)
    assert.equal(theme.tillThemeVariables(value)['--primary'], '#2563eb')
  }
})

test('custom colours keep readable action labels and text', () => {
  for (const color of [...theme.TILL_COLOR_PRESETS.map(p => p.color), '#ffffff', '#000000', '#ffff00', '#777777']) {
    const vars = theme.tillThemeVariables(color)
    assert.ok(theme.tillContrast(color, vars['--primary-foreground']) >= 4.5, color)
    assert.ok(theme.tillContrast(vars['--till-ink'], '#ffffff') >= 4.5, color)
    assert.equal(vars['--color-blue-600'], color)
  }
})

test('theme resolves the authenticated store and gives customization only to owners', async () => {
  let role = 'CASHIER'
  const action = loadService('backend/actions/pos-theme.ts', {
    '@/backend/services/pos-access-core': { resolvePosActor: async () => ({ businessId: 'b', shopkeeperId: 'store-a', role }) },
    '@/backend/domain/pos-config': config,
    '@/backend/db': { db: { shopkeeperProfile: { findUnique: async query => { assert.equal(query.where.id, 'store-a'); return { posConfig: { primaryColor: '#047857' } } } } } },
  })
  assert.equal((await action.getTillTheme()).canCustomize, false)
  role = 'OWNER'
  const result = await action.getTillTheme()
  assert.equal(result.canCustomize, true)
  assert.equal(result.color, '#047857')
  assert.equal(result.scope, 'b:store-a')
})

test('CSV exports escape spreadsheet formulas, quotes and newlines', () => {
  const { csvCell } = loadService('frontend/lib/pos-export.ts')
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"')
  assert.equal(csvCell('Milk, fresh\n500ml'), '"Milk, fresh\n500ml"')
  assert.equal(csvCell(null), '""')
})

test('settings action rejects employee colour changes and merges owner changes into the current store', async () => {
  let role = 'MANAGER'
  let stored = { primaryColor: '#2563eb', cashRounding: 5 }
  let writes = 0
  const profiles = loadService('backend/domain/pos-profiles.ts', { './pos-traits': traits })
  const actions = loadService('backend/actions/pos.ts', {
    zod: require('zod'),
    '@/backend/services/pos-access-core': { requirePosPermission: async () => ({ ok: true, actor: { role } }) },
    '@/backend/auth': { auth: async () => ({ user: { id: 'owner-user' } }) },
    '@/backend/services/pos-tenant': { posShopIdFor: async () => 'store-a' },
    '@/backend/domain/pos-profiles': profiles,
    '@/backend/domain/pos-traits': traits,
    '@/backend/domain/pos-config': config,
    '@/backend/db': { db: { shopkeeperProfile: {
      findUnique: async () => ({ id: 'store-a', posEnabled: true, posConfig: stored }),
      update: async query => { assert.equal(query.where.id, 'store-a'); stored = query.data.posConfig; writes++ },
    } } },
  })
  assert.equal((await actions.updatePosConfig({ primaryColor: '#047857' })).success, false)
  assert.equal(writes, 0)
  role = 'OWNER'
  assert.equal((await actions.updatePosConfig({ primaryColor: 'invalid' })).success, false)
  assert.equal((await actions.updatePosConfig({ primaryColor: '#047857' })).success, true)
  assert.equal(stored.primaryColor, '#047857')
  assert.equal(stored.cashRounding, 5)
})
