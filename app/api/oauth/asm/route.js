// OAuth Authorization Server Metadata (RFC 8414).
import { NextResponse } from 'next/server'
import { originOf, CORS } from '../../../../lib/mcp-oauth'
export const dynamic = 'force-dynamic'
export async function GET(request) {
  const o = originOf(request)
  return NextResponse.json({
    issuer: o,
    authorization_endpoint: `${o}/api/oauth/authorize`,
    token_endpoint: `${o}/api/oauth/token`,
    registration_endpoint: `${o}/api/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: ['read'],
  }, { headers: CORS })
}
export async function OPTIONS() { return new Response(null, { status: 204, headers: CORS }) }
