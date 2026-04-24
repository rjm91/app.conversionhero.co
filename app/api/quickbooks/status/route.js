import { NextResponse } from 'next/server'
import { isQBConnected } from '../../../../lib/quickbooks'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const connected = await isQBConnected()
    return NextResponse.json({ connected })
  } catch {
    return NextResponse.json({ connected: false })
  }
}
