import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET() {
  const params = new URLSearchParams({
    client_id:     process.env.QB_CLIENT_ID,
    scope:         'com.intuit.quickbooks.accounting',
    redirect_uri:  process.env.QB_REDIRECT_URI,
    response_type: 'code',
    state:         crypto.randomUUID(),
  })
  return NextResponse.redirect(
    `https://appcenter.intuit.com/connect/oauth2?${params.toString()}`
  )
}
