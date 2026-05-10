import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

const APP_HOSTS = ['app.conversionhero.co', 'localhost']

// Assign a random A/B variant cookie for funnel traffic splitting.
// Reads active variants from DB, picks one at random, sets cookie for 30 days.
async function assignVariantCookie(request, response, funnelSlug) {
  if (request.cookies.get('ch_variant')) return response

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { cookies: { getAll() { return [] }, setAll() {} } }
  )

  const { data: funnel } = await supabase
    .from('client_funnels')
    .select('id')
    .eq('slug', funnelSlug)
    .eq('status', 'live')
    .single()

  if (!funnel) return response

  const { data: variants } = await supabase
    .from('client_funnel_steps')
    .select('variant')
    .eq('funnel_id', funnel.id)
    .eq('step_order', 1)
    .eq('is_active', true)

  const labels = (variants || []).map(v => v.variant).filter(Boolean)
  if (labels.length < 2) return response

  const pick = labels[Math.floor(Math.random() * labels.length)]
  response.cookies.set('ch_variant', pick, {
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
    sameSite: 'lax',
  })
  return response
}

export async function middleware(request) {
  const { pathname } = request.nextUrl
  const hostname = (request.headers.get('host') || '').split(':')[0]

  // Dev mockups bypass all auth/domain logic so they're reachable from any host
  if (pathname.startsWith('/dev/') || pathname === '/dev') {
    return NextResponse.next()
  }

  const isPrivateIp = /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.|127\.)/.test(hostname)
  const isAppDomain =
    APP_HOSTS.some(h => hostname === h || hostname.endsWith(`.${h}`)) ||
    hostname.endsWith('.vercel.app') ||
    isPrivateIp

  // ── Custom client domain ──────────────────────────────────────────────────
  if (!isAppDomain) {
    // Let Next.js internals and API routes pass through unchanged
    if (pathname.startsWith('/_next') || pathname.startsWith('/api/')) {
      return NextResponse.next()
    }

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { cookies: { getAll() { return [] }, setAll() {} } }
    )

    const lookupHostname = hostname.startsWith('www.') ? hostname.slice(4) : hostname
    const { data: funnels } = await supabase
      .from('client_funnels')
      .select('slug')
      .eq('custom_domain', lookupHostname)
      .eq('status', 'live')
      .order('created_at', { ascending: true })
      .limit(1)

    const funnel = funnels?.[0] ?? null

    if (!funnel) {
      return new NextResponse(
        '<html><body style="font-family:sans-serif;text-align:center;padding:80px"><h2>Page not found</h2></body></html>',
        { status: 404, headers: { 'content-type': 'text/html' } }
      )
    }

    if (pathname.startsWith('/f/')) {
      const fSlug = pathname.split('/')[2]
      let resp = NextResponse.next()
      if (fSlug) resp = await assignVariantCookie(request, resp, fSlug)
      return resp
    }

    const rewritePath = pathname === '/'
      ? `/f/${funnel.slug}`
      : `/f/${funnel.slug}${pathname}`

    let resp = NextResponse.rewrite(new URL(rewritePath, request.url))
    resp = await assignVariantCookie(request, resp, funnel.slug)
    return resp
  }

  // ── App domain — auth guard for /control ─────────────────────────────────
  if (!pathname.startsWith('/control')) {
    return NextResponse.next({ request })
  }

  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, client_id')
    .eq('id', user.id)
    .single()

  const role     = profile?.role
  const clientId = profile?.client_id

  if (role === 'client_admin' || role === 'client_standard') {
    if (!clientId) {
      const url = new URL('/login', request.url)
      url.searchParams.set('error', 'no_client')
      return NextResponse.redirect(url)
    }

    if (role === 'client_standard' && pathname.includes('/billing')) {
      return NextResponse.redirect(new URL(`/control/${clientId}/dashboard`, request.url))
    }

    const clientRouteMatch = pathname.match(/^\/control\/([^/]+)/)
    if (clientRouteMatch && clientRouteMatch[1] !== clientId) {
      return NextResponse.redirect(new URL(`/control/${clientId}/dashboard`, request.url))
    }

    if (pathname === '/control' || pathname === '/control/clients') {
      return NextResponse.redirect(new URL(`/control/${clientId}/dashboard`, request.url))
    }
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico).*)'],
}
