import { createBrowserClient } from '@supabase/ssr'

// Cookie-aware browser client. The app's auth session lives in COOKIES
// (@supabase/ssr — see lib/supabase-browser.js, middleware). The previous
// plain createClient() here read localStorage, found no session, and sent
// every query anon-only — invisible while tables were open, but blank pages
// once RLS landed (tenant policies see auth.uid() = null). One client, one
// session source.
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)
