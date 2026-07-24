import crypto from 'node:crypto'

const STATE_TTL_SECONDS = 10 * 60

function base64url(value) {
  return Buffer.from(value).toString('base64url')
}

function decodeBase64url(value) {
  return Buffer.from(value, 'base64url').toString('utf8')
}

function signature(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url')
}

function sameSignature(left, right) {
  const leftBuffer = Buffer.from(left || '')
  const rightBuffer = Buffer.from(right || '')
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

export function createInstagramOAuthState({ clientId, userId, nonce, now = Date.now() }, secret) {
  if (!clientId || !userId || !secret) throw new Error('Instagram OAuth state is missing required values.')
  const issuedAt = Math.floor(now / 1000)
  const body = base64url(JSON.stringify({
    v: 1,
    c: String(clientId),
    u: String(userId),
    n: nonce || crypto.randomUUID(),
    iat: issuedAt,
    exp: issuedAt + STATE_TTL_SECONDS,
  }))
  return `${body}.${signature(body, secret)}`
}

export function readInstagramOAuthState(state, secret, now = Date.now()) {
  if (!state || !secret || typeof state !== 'string') return null
  const [body, suppliedSignature, extra] = state.split('.')
  if (!body || !suppliedSignature || extra || !sameSignature(signature(body, secret), suppliedSignature)) return null

  try {
    const payload = JSON.parse(decodeBase64url(body))
    const current = Math.floor(now / 1000)
    if (
      payload?.v !== 1 ||
      typeof payload.c !== 'string' ||
      typeof payload.u !== 'string' ||
      typeof payload.n !== 'string' ||
      !Number.isFinite(payload.iat) ||
      !Number.isFinite(payload.exp) ||
      payload.exp < current ||
      payload.iat > current + 60 ||
      payload.exp - payload.iat > STATE_TTL_SECONDS
    ) return null
    return { clientId: payload.c, userId: payload.u }
  } catch {
    return null
  }
}

export function buildInstagramAuthorizationUrl({ appId, redirectUri, state }) {
  const url = new URL('https://www.instagram.com/oauth/authorize')
  url.search = new URLSearchParams({
    enable_fb_login: '0',
    force_authentication: '1',
    client_id: appId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'instagram_business_basic,instagram_business_manage_messages',
    state,
  }).toString()
  return url.toString()
}
