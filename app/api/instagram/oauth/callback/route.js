export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createClient } from '../../../../../lib/supabase-server'
import { userCanAccessClient } from '../../../../../lib/access'
import {
  connectInstagramAccount,
  InstagramConnectError,
  instagramOAuthConfig,
  verifyInstagramAuthorizationState,
} from '../../../../../lib/instagram-oauth'
import { instagramAdmin } from '../../../../../lib/instagram-messaging'

function returnTo(request, clientId, result) {
  const path = clientId ? `/control/${encodeURIComponent(clientId)}/mission` : '/control'
  const url = new URL(path, request.url)
  url.searchParams.set('tab', 'conversations')
  url.searchParams.set('instagram_connect', result)
  return url
}

export async function GET(request) {
  const config = instagramOAuthConfig()
  const state = request.nextUrl.searchParams.get('state')
  const payload = config ? verifyInstagramAuthorizationState(state, config) : null
  const fallbackClientId = request.nextUrl.searchParams.get('client_id') || ''
  if (!payload) return NextResponse.redirect(returnTo(request, fallbackClientId, 'invalid_state'))

  const providerError = request.nextUrl.searchParams.get('error')
  if (providerError) return NextResponse.redirect(returnTo(request, payload.clientId, 'cancelled'))

  const code = request.nextUrl.searchParams.get('code')
  if (!code) return NextResponse.redirect(returnTo(request, payload.clientId, 'missing_code'))

  const ssr = createClient()
  const { data: { user } } = await ssr.auth.getUser()
  if (!user || user.id !== payload.userId || !await userCanAccessClient(user.id, payload.clientId)) {
    return NextResponse.redirect(returnTo(request, payload.clientId, 'unauthorized'))
  }

  try {
    await connectInstagramAccount({
      db: instagramAdmin(),
      clientId: payload.clientId,
      code,
      config,
    })
    return NextResponse.redirect(returnTo(request, payload.clientId, 'connected'))
  } catch (error) {
    const result = error instanceof InstagramConnectError ? error.code : 'connection_failed'
    return NextResponse.redirect(returnTo(request, payload.clientId, result))
  }
}
