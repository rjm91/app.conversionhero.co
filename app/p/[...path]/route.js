import fs from 'fs'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TRACKING_SNIPPET = '<script src="/track.js" data-slug="__SLUG__"></script>'

export async function GET(_request, { params }) {
  const { path: segments } = await params
  if (!Array.isArray(segments) || segments.length === 0) {
    return new Response('Not found', { status: 404 })
  }
  if (!segments.every(s => /^[a-z0-9-]+$/.test(s))) {
    return new Response('Not found', { status: 404 })
  }

  const root = path.join(process.cwd(), 'landing-pages')
  const filePath = path.join(root, ...segments, 'index.html')
  if (!filePath.startsWith(root + path.sep)) {
    return new Response('Not found', { status: 404 })
  }

  let html
  try {
    html = fs.readFileSync(filePath, 'utf8')
  } catch {
    return new Response('Not found', { status: 404 })
  }

  const slug = segments[0]
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
