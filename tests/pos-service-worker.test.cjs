const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')

function worker(url, fetcher, cached = null) {
  const events = {}, writes = [], deleted = []
  const cache = { match: async () => cached, put: async (...args) => writes.push(args) }
  const location = new URL(url)
  vm.runInNewContext(fs.readFileSync('public/pos/sw.js', 'utf8'), {
    URL, Response, AbortSignal, fetch: fetcher,
    self: { location, addEventListener: (name, handler) => { events[name] = handler }, clients: { claim: async () => {} }, skipWaiting: async () => {} },
    caches: { open: async () => cache, keys: async () => ['saji-till-shell-v2', 'saji-till-shell-v3', 'push-other'], delete: async name => deleted.push(name) },
  })
  const request = (path, options = {}) => {
    let response
    events.fetch({ request: { method: 'GET', url: location.origin + path, mode: 'cors', ...options }, respondWith: value => { response = value } })
    return response
  }
  return { events, request, writes, deleted }
}

test('development workers never intercept dev chunks, navigation or server actions', () => {
  for (const url of ['http://localhost:3000/pos/sw.js', 'https://dev.example.com/pos/sw.js?dev=1']) {
    const w = worker(url, () => { throw Error('Should not fetch') })
    assert.equal(w.request('/_next/static/chunks/dev.js'), undefined)
    assert.equal(w.request('/pos/home', { mode: 'navigate' }), undefined)
    assert.equal(w.request('/pos/sell', { method: 'POST' }), undefined)
    assert.equal(w.writes.length, 0)
  }
})

test('production fetches current chunks and caches only explicitly immutable output', async () => {
  const old = new Response('old', { headers: { 'Cache-Control': 'public, immutable' } })
  const w = worker('https://mysaji.com/pos/sw.js', async () => new Response('current'), old)
  assert.equal(await (await w.request('/_next/static/chunks/dev.js')).text(), 'current')
  assert.equal(w.writes.length, 0)
  const immutable = worker('https://mysaji.com/pos/sw.js', async () => new Response('built', { headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } }))
  assert.equal(await (await immutable.request('/_next/static/chunks/hash.js')).text(), 'built')
  assert.equal(immutable.writes.length, 1)
})

test('offline fallback accepts immutable chunks and rejects unversioned cached modules', async () => {
  const fail = async () => { throw Error('offline') }
  const safe = worker('https://mysaji.com/pos/sw.js', fail, new Response('built', { headers: { 'Cache-Control': 'public, immutable' } }))
  assert.equal(await (await safe.request('/_next/static/chunks/hash.js')).text(), 'built')
  const unsafe = worker('https://mysaji.com/pos/sw.js', fail, new Response('dev'))
  await assert.rejects(unsafe.request('/_next/static/chunks/dev.js'), /offline/)
  assert.equal(safe.request('/pos/sell', { method: 'POST' }), undefined)
  assert.equal(safe.request('/pos/home?_rsc=123'), undefined)
})

test('activation retires old till caches without removing other application caches', async () => {
  const w = worker('https://mysaji.com/pos/sw.js', async () => new Response(''))
  let done
  w.events.activate({ waitUntil: promise => { done = promise } })
  await done
  assert.deepEqual(w.deleted, ['saji-till-shell-v2', 'saji-till-shell-v3'])
})

test('logout purges Till HTML caches and acknowledges completion without deleting other applications', async () => {
  const w = worker('https://mysaji.com/pos/sw.js', async () => new Response(''))
  let done, acknowledged
  w.events.message({ data: 'logout', ports: [{ postMessage: value => { acknowledged = value } }], waitUntil: promise => { done = promise } })
  await done
  assert.equal(acknowledged, 'cleared')
  assert.deepEqual(w.deleted, ['saji-till-shell-v2', 'saji-till-shell-v3'])
})

test('sign-in navigation never falls back to an authenticated register shell', async () => {
  const paths = []
  const events = {}
  vm.runInNewContext(fs.readFileSync('public/pos/sw.js', 'utf8'), {
    URL, Response, AbortSignal,
    fetch: async () => { throw Error('offline') },
    self: { location: new URL('https://mysaji.com/pos/sw.js'), addEventListener: (name, handler) => { events[name] = handler } },
    caches: { open: async () => ({ match: async path => { paths.push(typeof path === 'string' ? path : path.url); return typeof path === 'string' && path === '/pos' ? new Response('Public Till landing') : null } }) },
  })
  let response
  events.fetch({ request: { method: 'GET', mode: 'navigate', url: 'https://mysaji.com/pos/login' }, respondWith: value => { response = value } })
  assert.equal(await (await response).text(), 'Public Till landing')
  assert.equal(paths.includes('/pos/sell'), false)
})
