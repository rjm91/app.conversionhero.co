import fs from 'fs'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TRACKING_SNIPPET = '<script src="/track.js" data-slug="__SLUG__"></script>'

export async function GET(_request, { params }) {
  const { slug } = await params
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return new Response('Not found', { status: 404 })
  }

  const filePath = path.join(process.cwd(), 'landing-pages', slug, 'index.html')
  let html
  try {
    html = fs.readFileSync(filePath, 'utf8')
  } catch {
    return new Response('Not found', { status: 404 })
  }

  const snippet = TRACKING_SNIPPET.replace('__SLUG__', slug)
  if (html.includes('</body>')) {
    html = html.replace('</body>', `${snippet}\n</body>`)
  } else {
    html += snippet
  }

  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}
