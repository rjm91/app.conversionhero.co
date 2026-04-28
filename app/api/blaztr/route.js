import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BLAZTR_BASE = 'https://blaztr.app/api/blaztrApi'
const API_KEY = process.env.BLAZTR_API_KEY

export async function GET(req) {
  if (!API_KEY) {
    return NextResponse.json({ error: 'BLAZTR_API_KEY not configured' }, { status: 500 })
  }

  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action') || 'summary'
  const campaignId = searchParams.get('campaign_id')

  let url = `${BLAZTR_BASE}?action=${action}`
  if (campaignId) url += `&campaign_id=${campaignId}`

  const res = await fetch(url, {
    headers: { 'x-api-key': API_KEY },
    cache: 'no-store',
  })

  const data = await res.json()
  return NextResponse.json(data)
}
