// Token endpoint — authorization_code (with PKCE S256) and refresh_token.
// Tokens are signed blobs; access 30 days, refresh 180 days.
import { NextResponse } from 'next/server'
import { sign, verify, s256, CORS } from '../../../../lib/mcp-oauth'
export const dynamic = 'force-dynamic'

const issue = () => ({
  access_token: sign({ t: 'access', exp: Date.now() + 30 * 86400000 }),
  token_type: 'Bearer',
  expires_in: 30 * 86400,
  refresh_token: sign({ t: 'refresh', exp: Date.now() + 180 * 86400000 }),
  scope: 'read',
})

export async function POST(request) {
  const ct = request.headers.get('content-type') || ''
  let p = {}
  if (ct.includes('json')) { try { p = await request.json() } catch { /* empty */ } }
  else { const f = await request.formData(); for (const [k, v] of f.entries()) p[k] = String(v) }

  if (p.grant_type === 'authorization_code') {
    const code = verify(p.code)
    if (!code || code.t !== 'code') return NextResponse.json({ error: 'invalid_grant' }, { status: 400, headers: CORS })
    if (code.redirect_uri && p.redirect_uri && code.redirect_uri !== p.redirect_uri) return NextResponse.json({ error: 'invalid_grant', error_description: 'redirect_uri mismatch' }, { status: 400, headers: CORS })
    if (code.code_challenge && s256(p.code_verifier || '') !== code.code_challenge) return NextResponse.json({ error: 'invalid_grant', error_description: 'PKCE verification failed' }, { status: 400, headers: CORS })
    return NextResponse.json(issue(), { headers: CORS })
  }
  if (p.grant_type === 'refresh_token') {
    const rt = verify(p.refresh_token)
    if (!rt || rt.t !== 'refresh') return NextResponse.json({ error: 'invalid_grant' }, { status: 400, headers: CORS })
    return NextResponse.json(issue(), { headers: CORS })
  }
  return NextResponse.json({ error: 'unsupported_grant_type' }, { status: 400, headers: CORS })
}
export async function OPTIONS() { return new Response(null, { status: 204, headers: CORS }) }
