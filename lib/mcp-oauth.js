// Minimal OAuth 2.0 layer for the remote MCP server (Chorus requires the MCP
// auth spec: discovery metadata + dynamic client registration + authorization
// code with PKCE). Stateless: every artifact (client_id, code, token) is an
// HMAC-signed blob keyed by CHORUS_MCP_KEY — no new tables. The human gate is
// the same shared key, entered ONCE on the authorize page.

import crypto from 'crypto'

const SECRET = () => process.env.CHORUS_MCP_KEY || ''
const b64u = (buf) => Buffer.from(buf).toString('base64url')
const unb64u = (s) => Buffer.from(String(s), 'base64url').toString('utf8')

export function sign(payload) {
  const body = b64u(JSON.stringify(payload))
  const mac = crypto.createHmac('sha256', SECRET()).update(body).digest('base64url')
  return `${body}.${mac}`
}

export function verify(token) {
  try {
    const [body, mac] = String(token || '').split('.')
    if (!body || !mac) return null
    const expect = crypto.createHmac('sha256', SECRET()).update(body).digest('base64url')
    if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expect))) return null
    const payload = JSON.parse(unb64u(body))
    if (payload.exp && Date.now() > payload.exp) return null
    return payload
  } catch { return null }
}

export const s256 = (verifier) => crypto.createHash('sha256').update(verifier).digest('base64url')

export function originOf(request) {
  const url = new URL(request.url)
  // Behind Vercel the proto is https even though the runtime sees http.
  const host = request.headers.get('x-forwarded-host') || url.host
  return `https://${host}`
}

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, authorization, mcp-protocol-version',
}
