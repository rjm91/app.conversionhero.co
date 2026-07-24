import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildInstagramAuthorizationUrl,
  createInstagramOAuthState,
  readInstagramOAuthState,
} from '../lib/instagram-oauth-core.mjs'

test('Instagram OAuth state is signed, scoped, and short lived', () => {
  const now = Date.UTC(2026, 6, 24, 12, 0, 0)
  const state = createInstagramOAuthState({ clientId: 'ch1001', userId: 'user-1', nonce: 'nonce', now }, 'test-secret')
  assert.deepEqual(readInstagramOAuthState(state, 'test-secret', now + 60_000), { clientId: 'ch1001', userId: 'user-1' })
  assert.equal(readInstagramOAuthState(state, 'wrong-secret', now + 60_000), null)
  assert.equal(readInstagramOAuthState(`${state}x`, 'test-secret', now + 60_000), null)
  assert.equal(readInstagramOAuthState(state, 'test-secret', now + 11 * 60_000), null)
})

test('Instagram authorization URL uses the messaging-only professional-account scopes', () => {
  const url = new URL(buildInstagramAuthorizationUrl({
    appId: 'meta-app',
    redirectUri: 'https://app.conversionhero.co/api/instagram/oauth/callback',
    state: 'signed-state',
  }))
  assert.equal(url.origin, 'https://www.instagram.com')
  assert.equal(url.pathname, '/oauth/authorize')
  assert.equal(url.searchParams.get('client_id'), 'meta-app')
  assert.equal(url.searchParams.get('scope'), 'instagram_business_basic,instagram_business_manage_messages')
  assert.equal(url.searchParams.get('state'), 'signed-state')
})
