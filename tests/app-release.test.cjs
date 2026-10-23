const { test } = require('node:test')
const assert = require('node:assert/strict')
const { loadService } = require('./load-service.cjs')

function releaseService(value, env = 'production') {
  return loadService('backend/services/app-release.ts', {
    'node:fs/promises': { readFile: async () => { if (value instanceof Error) throw value; return value } },
  }, { process: { env: { NODE_ENV: env }, cwd: () => 'test-app' } })
}

test('app release comes from the production build and fails open when unavailable', async () => {
  assert.equal(await releaseService(' build-2026_A\n').getAppRelease(), 'build-2026_A')
  assert.equal(await releaseService(new Error('missing')).getAppRelease(), null)
  assert.equal(await releaseService('<invalid>').getAppRelease(), null)
  assert.equal(await releaseService('build-one', 'development').getAppRelease(), null)
})

test('release endpoint never caches or indexes version responses', async () => {
  const route = loadService('app/api/app-release/route.ts', {
    '@/backend/services/app-release': { getAppRelease: async () => 'build-two' },
  }, { Response })
  const result = await route.GET()
  assert.equal((await result.json()).release, 'build-two')
  assert.match(result.headers.get('Cache-Control'), /no-store/)
  assert.equal(result.headers.get('CDN-Cache-Control'), 'no-store')
  assert.equal(result.headers.get('X-Robots-Tag'), 'noindex')
})
