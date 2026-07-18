// Dynamic Client Registration (RFC 7591) — stateless: the client_id IS the
// signed registration (redirect_uris inside), so /authorize can validate the
// redirect target without a database.
import { NextResponse } from 'next/server'
import { sign, CORS } from '../../../../lib/mcp-oauth'
export const dynamic = 'force-dynamic'
export async function POST(request) {
  let body = {}
  try { body = await request.json() } catch { /* empty */ }
  const redirect_uris = Array.isArray(body.redirect_uris) ? body.redirect_uris.slice(0, 5) : []
  if (!redirect_uris.length) return NextResponse.json({ error: 'invalid_client_metadata', error_description: 'redirect_uris required' }, { status: 400, headers: CORS })
  const client_id = sign({ t: 'client', redirect_uris })
  return NextResponse.json({
    client_id,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    redirect_uris,
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    client_name: body.client_name || 'mcp-client',
  }, { status: 201, headers: CORS })
}
export async function OPTIONS() { return new Response(null, { status: 204, headers: CORS }) }
