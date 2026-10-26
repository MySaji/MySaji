const { test } = require('node:test')
const assert = require('node:assert/strict')
const { loadService } = require('./load-service.cjs')

test('background session loading keeps authenticated portal content; initial loading and confirmed sign-out stay protected', () => {
  let current
  const { useAuth } = loadService('frontend/lib/hooks/useAuth.ts', {
    react: { useCallback: callback => callback },
    'next-auth/react': { useSession: () => current },
    '@/frontend/lib/pos-offline-scope': {}, '@/frontend/lib/session-heartbeat': {}, '@/frontend/lib/device-push': {},
  })
  const data = { user: { id: 'admin', role: 'admin', verificationStatus: 'basic', isActive: true } }
  current = { data, status: 'authenticated' }
  assert.equal(useAuth().isAuthenticated, true)
  current = { data, status: 'loading' }
  assert.equal(useAuth().isLoading, false)
  assert.equal(useAuth().isAuthenticated, true)
  assert.equal(useAuth().user.id, 'admin')
  current = { data: null, status: 'loading' }
  assert.equal(useAuth().isLoading, true)
  assert.equal(useAuth().isAuthenticated, false)
  current = { data: null, status: 'unauthenticated' }
  assert.equal(useAuth().isAuthenticated, false)
  current = { data, status: 'unauthenticated' }
  assert.equal(useAuth().isAuthenticated, false)
})
