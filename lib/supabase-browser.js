// Single browser client for the whole app — re-exports the singleton from
// lib/supabase.js. Two separate createBrowserClient() call sites ended up as
// two GoTrueClient instances (bundler module duplication), which fight over
// the navigator lock on the auth cookie ("lock ... was stolen") and kill
// whichever query loses. One module owns the instance; everything shares it.
import { supabase } from './supabase'

export function createClient() {
  return supabase
}
