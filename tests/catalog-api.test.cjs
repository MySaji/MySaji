const { test } = require('node:test')
const assert = require('node:assert/strict')
const { loadService } = require('./load-service.cjs')

// The loader's sandbox has no web globals; route fetch through the test's current mock.
const web = { fetch: (...args) => global.fetch(...args), AbortSignal, URL }
const loadClient = () => loadService('backend/services/catalog-api.ts', {}, web)

// Objects built inside the sandbox have its prototypes; compare values.
const plain = (value) => JSON.parse(JSON.stringify(value))
const category = (id, name) => ({ id, name, slug: id, type: 'SERVICE', icon: null, parent_id: null, tier: 'core' })

function withEnv(url, run) {
  const previous = { url: process.env.SAJI_API_URL, fetch: global.fetch, error: console.error }
  if (url === undefined) delete process.env.SAJI_API_URL
  else process.env.SAJI_API_URL = url
  console.error = () => {}
  return run().finally(() => {
    if (previous.url === undefined) delete process.env.SAJI_API_URL
    else process.env.SAJI_API_URL = previous.url
    global.fetch = previous.fetch
    console.error = previous.error
  })
}

test('without SAJI_API_URL the API is not called and callers keep their Prisma query', () => withEnv(undefined, async () => {
  global.fetch = async () => assert.fail('must not call the API')
  const { fetchCategories } = loadClient()
  assert.equal(await fetchCategories('SERVICE'), null)
}))

test('collects every page from the internal API address', () => withEnv('http://api:8000/', async () => {
  const requested = []
  global.fetch = async (url) => {
    requested.push(url)
    const second = url.includes('page=2')
    return {
      ok: true,
      json: async () => second
        ? { next: null, results: [category('c3', 'Plumbing')] }
        // DRF builds `next` from the Host header; the client must stay on its own base.
        : { next: 'http://localhost/api/v1/categories?page=2&page_size=100&type=SERVICE', results: [category('c1', 'Cleaning'), category('c2', 'Electrical')] },
    }
  }
  const { fetchCategories } = loadClient()
  const rows = await fetchCategories('SERVICE')
  assert.deepEqual(plain(rows.map((r) => r.name)), ['Cleaning', 'Electrical', 'Plumbing'])
  assert.equal(requested[0], 'http://api:8000/api/v1/categories?type=SERVICE&page_size=100')
  assert.equal(requested[1], 'http://api:8000/api/v1/categories?page=2&page_size=100&type=SERVICE')
}))

test('an API error or outage returns null so the page falls back to the database', () => withEnv('http://api:8000', async () => {
  const { fetchCategories } = loadClient()
  global.fetch = async () => ({ ok: false, status: 503, json: async () => ({}) })
  assert.equal(await fetchCategories('SERVICE'), null)
  global.fetch = async () => { throw new TypeError('fetch failed') }
  assert.equal(await fetchCategories('SERVICE'), null)
}))

test('getServiceCategories falls back to Prisma when the API is down', () => withEnv('http://api:8000', async () => {
  global.fetch = async () => { throw new TypeError('fetch failed') }
  const home = loadService('backend/actions/home.ts', {
    '@/backend/db': { db: { category: { findMany: async (query) => {
      assert.deepEqual(plain(query.where), { type: 'SERVICE', isActive: true })
      return [{ id: 'c9', name: 'Masonry', slug: 'masonry', tier: null }]
    } } } },
    '@/backend/services/catalog-api': loadClient(),
    '@/backend/auth': {}, '@/backend/domain/format': {}, '@/backend/domain/geo': {}, '@/backend/services/geo-sql': {},
    '@/backend/actions/geo': {}, '@/backend/domain/public-catalog': { PUBLIC_SHOP_WHERE: {} },
  })
  assert.deepEqual(plain(await home.getServiceCategories()), [{ id: 'c9', name: 'Masonry', slug: 'masonry', tier: null }])
}))

test('getServiceCategories prefers the API and keeps the same shape', () => withEnv('http://api:8000', async () => {
  global.fetch = async () => ({ ok: true, json: async () => ({ next: null, results: [category('c1', 'Cleaning')] }) })
  const home = loadService('backend/actions/home.ts', {
    '@/backend/db': { db: { category: { findMany: async () => assert.fail('must use the API when it answers') } } },
    '@/backend/services/catalog-api': loadClient(),
    '@/backend/auth': {}, '@/backend/domain/format': {}, '@/backend/domain/geo': {}, '@/backend/services/geo-sql': {},
    '@/backend/actions/geo': {}, '@/backend/domain/public-catalog': { PUBLIC_SHOP_WHERE: {} },
  })
  assert.deepEqual(plain(await home.getServiceCategories()), [{ id: 'c1', name: 'Cleaning', slug: 'c1', tier: 'core' }])
}))
