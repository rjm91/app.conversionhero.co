// OAuth Protected Resource Metadata (RFC 9728) for the MCP server.
import { NextResponse } from 'next/server'
import { originOf, CORS } from '../../../../lib/mcp-oauth'
export const dynamic = 'force-dynamic'
export async function GET(request) {
  const o = originOf(request)
  return NextResponse.json({
    resource: `${o}/api/mcp/mcp`,
    authorization_servers: [o],
    bearer_methods_supported: ['header'],
    scopes_supported: ['read'],
  }, { headers: CORS })
}
export async function OPTIONS() { return new Response(null, { status: 204, headers: CORS }) }
