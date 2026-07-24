export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { gateInstagramClient } from '../../../../../lib/instagram-api-auth'
import { createInstagramAuthorization, instagramOAuthConfig } from '../../../../../lib/instagram-oauth'

function returnTo(request, clientId, result) {
  const path = clientId ? `/control/${encodeURIComponent(clientId)}/mission` : '/control'
  const url = new URL(path, request.url)
  url.searchParams.set('tab', 'conversations')
  url.searchParams.set('instagram_connect', result)
  return url
}

export async function GET(request) {
  const clientId = request.nextUrl.searchParams.get('client_id')
  const gate = await gateInstagramClient(clientId)
  if (gate.error) return NextResponse.redirect(returnTo(request, clientId, 'unauthorized'))

  const config = instagramOAuthConfig()
  if (!config) return NextResponse.redirect(returnTo(request, clientId, 'configuration_required'))

  const authorizationUrl = createInstagramAuthorization({
    clientId,
    userId: gate.user.id,
    config,
  })
  return NextResponse.redirect(authorizationUrl)
}
