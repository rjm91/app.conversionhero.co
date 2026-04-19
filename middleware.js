import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

export async function middleware(request) {
  const { pathname } = request.nextUrl
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

  // Not logged in — redirect to login
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Get profile for role + client_id
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, client_id')
    .eq('id', user.id)
    .single()

  const role = profile?.role
  const clientId = profile?.client_id

  // client_admin / client_standard — can only access their own client routes
  if (role === 'client_admin' || role === 'client_standard') {
    // Defensive: a client user with no client_id is a misconfigured account.
    // Sign them out instead of looping redirects to /control/null/dashboard.
    if (!clientId) {
      const url = new URL('/login', request.url)
      url.searchParams.set('error', 'no_client')
      return NextResponse.redirect(url)
    }

    // Block billing for client_standard
    if (role === 'client_standard' && pathname.includes('/billing')) {
      return NextResponse.redirect(new URL(`/control/${clientId}/dashboard`, request.url))
    }

    // Block access to any other client's routes
    const clientRouteMatch = pathname.match(/^\/control\/([^/]+)/)
    if (clientRouteMatch && clientRouteMatch[1] !== clientId) {
      return NextResponse.redirect(new URL(`/control/${clientId}/dashboard`, request.url))
    }

    // Block access to top-level admin pages (/control, /control/clients)
    if (pathname === '/control' || pathname === '/control/clients') {
      return NextResponse.redirect(new URL(`/control/${clientId}/dashboard`, request.url))
    }
  }

  return response
}

export const config = {
  matcher: ['/control/:path*'],
}
