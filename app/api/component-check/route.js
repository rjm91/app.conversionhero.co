import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const name = searchParams.get('name')

  if (!name || !/^[A-Za-z0-9_-]+$/.test(name)) {
    return NextResponse.json({ exists: false })
  }

  // Derive folder from component name convention:
  // SynergyGenerator* -> synergy-generator, SynergyHVAC* -> synergy-hvac, etc.
  const base = name.replace(/V\d+$/, '')
  const folder = base.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
  const filePath = path.join(process.cwd(), 'components', 'funnels', folder, `${name}.js`)

  return NextResponse.json({ exists: fs.existsSync(filePath) })
}
