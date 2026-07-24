import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import test from 'node:test'

import {
  normalizeMessageText,
  replyPolicy,
  sanitizeAttachments,
  sanitizeReferral,
  sourceFromReferral,
  verifyMetaSignature,
} from '../lib/instagram-messaging-core.mjs'

test('webhook signatures accept only the exact signed raw body', () => {
  const secret = 'test-app-secret'
  const raw = Buffer.from('{"object":"instagram","entry":[]}')
  const signature = `sha256=${crypto.createHmac('sha256', secret).update(raw).digest('hex')}`
  assert.equal(verifyMetaSignature(raw, signature, secret), true)
  assert.equal(verifyMetaSignature(Buffer.from(`${raw} `), signature, secret), false)
  assert.equal(verifyMetaSignature(raw, signature.replace('sha256=', 'sha1='), secret), false)
  assert.equal(verifyMetaSignature(raw, 'sha256=not-hex', secret), false)
})

test('native ad referrals retain attribution ids without storing unrelated payload fields', () => {
  const referral = sanitizeReferral({
    source: 'ADS',
    type: 'OPEN_THREAD',
    ref: 'summer-contour',
    ad_id: 'ad-123',
    ads_context_data: {
      campaign_id: 'campaign-456',
      adset_id: 'adset-789',
      ad_title: 'Contour consultation',
      photo_url: 'https://cdn.example.com/ad.jpg',
      private_internal_field: 'do-not-store',
    },
    another_unknown_field: 'do-not-store',
  })
  assert.deepEqual(sourceFromReferral(referral), { type: 'ads', label: 'Ads' })
  assert.equal(referral.ad_id, 'ad-123')
  assert.equal(referral.campaign_id, 'campaign-456')
  assert.equal(referral.adset_id, 'adset-789')
  assert.equal('private_internal_field' in referral.ads_context_data, false)
  assert.equal('another_unknown_field' in referral, false)
})

test('attachments reject non-HTTPS URLs and cap the stored list', () => {
  const attachments = sanitizeAttachments([
    { type: 'image', payload: { url: 'http://example.com/insecure.jpg' } },
    { type: 'image', payload: { url: 'https://example.com/safe.jpg' } },
    ...Array.from({ length: 12 }, (_, index) => ({ type: 'file', title: `file ${index}` })),
  ])
  assert.equal(attachments.some(item => item.url?.startsWith('http:')), false)
  assert.equal(attachments.length, 9)
})

test('reply policy enforces standard, human-agent, expired, and disconnected states', () => {
  const now = new Date('2026-07-23T12:00:00.000Z')
  const standard = replyPolicy({
    messaging_window_expires_at: '2026-07-23T13:00:00.000Z',
    human_agent_window_expires_at: '2026-07-29T12:00:00.000Z',
  }, { status: 'connected', human_agent_enabled: false }, now)
  assert.equal(standard.mode, 'standard')
  assert.equal(standard.can_reply, true)

  const humanAgent = replyPolicy({
    messaging_window_expires_at: '2026-07-23T11:00:00.000Z',
    human_agent_window_expires_at: '2026-07-29T12:00:00.000Z',
  }, { status: 'connected', human_agent_enabled: true }, now)
  assert.equal(humanAgent.mode, 'human_agent')
  assert.equal(humanAgent.can_reply, true)

  const expired = replyPolicy({
    messaging_window_expires_at: '2026-07-22T12:00:00.000Z',
    human_agent_window_expires_at: '2026-07-23T11:59:59.000Z',
  }, { status: 'connected', human_agent_enabled: true }, now)
  assert.equal(expired.mode, 'expired')
  assert.equal(expired.can_reply, false)

  assert.equal(replyPolicy({}, null, now).mode, 'disconnected')
})

test('message text is trimmed, bounded, and never fabricates content', () => {
  assert.equal(normalizeMessageText('  hello  '), 'hello')
  assert.equal(normalizeMessageText('   '), null)
  assert.equal(normalizeMessageText('a'.repeat(1005)).length, 1000)
})

