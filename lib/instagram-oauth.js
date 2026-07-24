import 'server-only'

import {
  buildInstagramAuthorizationUrl,
  createInstagramOAuthState,
  readInstagramOAuthState,
} from './instagram-oauth-core.mjs'

const API_VERSION = process.env.META_INSTAGRAM_API_VERSION || 'v24.0'
const GRAPH_ROOT = process.env.META_INSTAGRAM_GRAPH_URL || 'https://graph.instagram.com'

export class InstagramConnectError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

export function instagramOAuthConfig() {
  const appId = process.env.META_INSTAGRAM_APP_ID
  const appSecret = process.env.META_INSTAGRAM_APP_SECRET
  const redirectUri = process.env.META_INSTAGRAM_REDIRECT_URI
  const stateSecret = process.env.META_INSTAGRAM_OAUTH_STATE_SECRET || appSecret
  if (!appId || !appSecret || !redirectUri || !stateSecret) return null
  return { appId, appSecret, redirectUri, stateSecret, apiVersion: API_VERSION, graphRoot: GRAPH_ROOT }
}

export function createInstagramAuthorization({ clientId, userId, config, now }) {
  const state = createInstagramOAuthState({ clientId, userId, now }, config.stateSecret)
  return buildInstagramAuthorizationUrl({ appId: config.appId, redirectUri: config.redirectUri, state })
}

export function verifyInstagramAuthorizationState(state, config, now) {
  return readInstagramOAuthState(state, config?.stateSecret, now)
}

function expiresAt(seconds) {
  const duration = Number(seconds)
  return Number.isFinite(duration) && duration > 0
    ? new Date(Date.now() + duration * 1000).toISOString()
    : null
}

function permissionsFrom(...responses) {
  const values = responses.flatMap(response => Array.isArray(response?.permissions) ? response.permissions : [])
  return [...new Set(values.filter(value => typeof value === 'string' && value.length <= 120))]
}

async function readJson(response) {
  return response.json().catch(() => ({}))
}

async function exchangeCode(code, config) {
  const response = await fetch('https://api.instagram.com/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.appId,
      client_secret: config.appSecret,
      grant_type: 'authorization_code',
      redirect_uri: config.redirectUri,
      code,
    }),
    cache: 'no-store',
  })
  const json = await readJson(response)
  if (!response.ok || !json.access_token) {
    throw new InstagramConnectError('token_exchange_failed', 'Instagram could not approve this connection. Please try again.')
  }
  return json
}

async function exchangeLongLivedToken(shortToken, config) {
  const url = new URL(`${config.graphRoot}/access_token`)
  url.search = new URLSearchParams({
    grant_type: 'ig_exchange_token',
    client_secret: config.appSecret,
    access_token: shortToken,
  }).toString()
  const response = await fetch(url, { cache: 'no-store' })
  const json = await readJson(response)
  if (!response.ok || !json.access_token) {
    throw new InstagramConnectError('long_lived_token_failed', 'Instagram approved the account, but we could not finish the secure connection. Please try again.')
  }
  return json
}

async function fetchInstagramProfile(accountId, accessToken, config) {
  const url = new URL(`${config.graphRoot}/${config.apiVersion}/${encodeURIComponent(accountId)}`)
  url.searchParams.set('fields', 'id,username,name,profile_picture')
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })
  const json = await readJson(response)
  if (!response.ok) return {}
  return {
    id: json.id ? String(json.id) : null,
    username: typeof json.username === 'string' ? json.username.slice(0, 100) : null,
    displayName: typeof json.name === 'string' ? json.name.slice(0, 200) : null,
    profilePictureUrl: typeof json.profile_picture === 'string' && /^https:\/\//i.test(json.profile_picture)
      ? json.profile_picture.slice(0, 2000)
      : null,
  }
}

async function subscribeToWebhook(accountId, accessToken, config) {
  const response = await fetch(`${config.graphRoot}/${config.apiVersion}/${encodeURIComponent(accountId)}/subscribed_apps`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })
  const json = await readJson(response)
  if (!response.ok || json.success === false) {
    throw new InstagramConnectError('webhook_subscription_failed', 'Instagram approved the account, but Meta could not subscribe it to message updates. Check the Instagram webhook setup, then reconnect.')
  }
}

function connectionRow({ clientId, accountId, profile, accessToken, tokenExpiry, permissions, status, errorCode = null, subscribedAt = null }) {
  return {
    client_id: clientId,
    instagram_account_id: accountId,
    page_id: null,
    username: profile.username,
    display_name: profile.displayName,
    profile_picture_url: profile.profilePictureUrl,
    access_token: accessToken,
    token_expires_at: tokenExpiry,
    permissions,
    human_agent_enabled: false,
    status,
    webhook_subscribed_at: subscribedAt,
    last_error_code: errorCode,
    last_error_at: errorCode ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }
}

async function saveConnection(db, row) {
  const { error } = await db.from('instagram_connections').upsert(row, { onConflict: 'client_id' })
  if (!error) return
  if (error.code === '23505') {
    throw new InstagramConnectError('account_in_use', 'This Instagram account is already linked to a different client workspace.')
  }
  throw new InstagramConnectError('connection_save_failed', 'Instagram was approved, but the secure connection could not be saved. Please try again.')
}

export async function connectInstagramAccount({ db, clientId, code, config = instagramOAuthConfig() }) {
  if (!config) throw new InstagramConnectError('configuration_required', 'Instagram Login has not been configured on this deployment yet.')
  const shortLived = await exchangeCode(code, config)
  const longLived = await exchangeLongLivedToken(shortLived.access_token, config)
  const accessToken = longLived.access_token
  const tokenExpiry = expiresAt(longLived.expires_in || shortLived.expires_in)
  const returnedAccountId = shortLived.user_id ? String(shortLived.user_id) : null
  if (!returnedAccountId) throw new InstagramConnectError('account_lookup_failed', 'Instagram did not return a professional account for this login.')
  const profile = await fetchInstagramProfile(returnedAccountId, accessToken, config)
  const accountId = profile.id || (shortLived.user_id ? String(shortLived.user_id) : null)
  if (!accountId) throw new InstagramConnectError('account_lookup_failed', 'Instagram did not return a professional account for this login.')

  const permissions = permissionsFrom(shortLived, longLived)
  const pendingRow = connectionRow({
    clientId,
    accountId,
    profile,
    accessToken,
    tokenExpiry,
    permissions,
    status: 'error',
    errorCode: 'webhook_subscription_pending',
  })
  await saveConnection(db, pendingRow)

  try {
    await subscribeToWebhook(accountId, accessToken, config)
  } catch (error) {
    const code = error instanceof InstagramConnectError ? error.code : 'webhook_subscription_failed'
    await saveConnection(db, { ...pendingRow, last_error_code: code, last_error_at: new Date().toISOString() })
    throw error
  }

  await saveConnection(db, connectionRow({
    clientId,
    accountId,
    profile,
    accessToken,
    tokenExpiry,
    permissions,
    status: 'connected',
    subscribedAt: new Date().toISOString(),
  }))
  return { username: profile.username, accountId }
}
