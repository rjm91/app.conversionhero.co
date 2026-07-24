export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import {
  ingestInstagramWebhook,
  verifyMetaSignature,
} from '../../../../../lib/instagram-messaging'

export async function GET(request) {
  const mode = request.nextUrl.searchParams.get('hub.mode')
  const token = request.nextUrl.searchParams.get('hub.verify_token')
  const challenge = request.nextUrl.searchParams.get('hub.challenge')
  const expected = process.env.META_INSTAGRAM_WEBHOOK_VERIFY_TOKEN

  if (mode === 'subscribe' && expected && token === expected && challenge) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' },
    })
  }
  return NextResponse.json({ error: 'Webhook verification failed.' }, { status: 403 })
}

export async function POST(request) {
  const raw = Buffer.from(await request.arrayBuffer())
  const signature = request.headers.get('x-hub-signature-256')
  const appSecret = process.env.META_INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET
  if (!verifyMetaSignature(raw, signature, appSecret)) {
    return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 401 })
  }

  let payload
  try {
    payload = JSON.parse(raw.toString('utf8'))
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  try {
    const result = await ingestInstagramWebhook(payload)
    return NextResponse.json({ received: true, handled: result.handled })
  } catch {
    // Intentionally omit payloads, message text, tokens, and provider details.
    // A non-2xx response lets Meta retry the same idempotent message event.
    return NextResponse.json({ error: 'Webhook ingestion failed.' }, { status: 500 })
  }
}

