import 'server-only'

import { createClient as createServerClient } from './supabase-server'
import { userCanAccessClient } from './access'
import {
  hasInstagramConversations,
  instagramAdmin,
} from './instagram-messaging'

export async function gateInstagramClient(clientId) {
  const ssr = createServerClient()
  const { data: { user } } = await ssr.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401 }
  if (!clientId) return { error: 'client_id is required', status: 400 }
  if (!await userCanAccessClient(user.id, clientId)) return { error: 'Forbidden', status: 403 }

  const db = instagramAdmin()
  const { data: client, error } = await db
    .from('client')
    .select('client_id, settings')
    .eq('client_id', clientId)
    .maybeSingle()
  if (error) return { error: 'Could not verify client configuration.', status: 500 }
  if (!client || !hasInstagramConversations(client.settings)) return { error: 'Not found', status: 404 }
  return { ok: true, db, user, client }
}

export function publicConnection(connection) {
  if (!connection) return {
    connected: false,
    status: 'disconnected',
    username: null,
    display_name: null,
    profile_picture_url: null,
    last_error_at: null,
  }
  return {
    connected: connection.status === 'connected',
    status: connection.status,
    username: connection.username,
    display_name: connection.display_name,
    profile_picture_url: connection.profile_picture_url,
    last_error_at: connection.last_error_at,
  }
}

