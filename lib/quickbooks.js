import { createClient } from '@supabase/supabase-js'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const QB_API = 'https://quickbooks.api.intuit.com/v3/company'

async function refreshToken(stored) {
  const credentials = Buffer.from(
    `${process.env.QB_CLIENT_ID}:${process.env.QB_CLIENT_SECRET}`
  ).toString('base64')

  const res = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: stored.refresh_token,
    }),
  })

  const data = await res.json()
  if (!data.access_token) throw new Error('QB token refresh failed: ' + JSON.stringify(data))

  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString()
  await db().from('qb_tokens').update({
    access_token: data.access_token,
    refresh_token: data.refresh_token || stored.refresh_token,
    access_token_expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  }).eq('realm_id', stored.realm_id)

  return data.access_token
}

// Returns { token, realmId } for the connected QuickBooks company.
// Uses QB_REALM_ID if explicitly set, otherwise the most recently saved
// connection — so the integration follows whatever company is connected.
async function getQBSession() {
  const sb = db()
  let row = null
  // Prefer the configured realm if it has a saved token…
  if (process.env.QB_REALM_ID) {
    const { data } = await sb.from('qb_tokens').select('*').eq('realm_id', process.env.QB_REALM_ID).limit(1)
    row = data && data[0]
  }
  // …otherwise fall back to the most recently connected company.
  if (!row) {
    const { data } = await sb.from('qb_tokens').select('*').order('updated_at', { ascending: false }).limit(1)
    row = data && data[0]
  }
  if (!row) throw new Error('QuickBooks not connected')

  const isExpiring = r => new Date(r.access_token_expires_at).getTime() - Date.now() < 5 * 60 * 1000
  let token = row.access_token
  // Refresh if expiring within 5 minutes
  if (isExpiring(row)) {
    try {
      token = await refreshToken(row)
    } catch (err) {
      // A concurrent request may have just rotated the refresh token and saved
      // a fresh one. Re-read once and use it rather than failing the request.
      const { data } = await sb.from('qb_tokens').select('*').eq('realm_id', row.realm_id).limit(1)
      const latest = data && data[0]
      if (latest && !isExpiring(latest)) token = latest.access_token
      else throw err
    }
  }
  return { token, realmId: row.realm_id }
}

export async function getQBAccessToken() {
  return (await getQBSession()).token
}

export async function qbQuery(sql) {
  const { token, realmId } = await getQBSession()
  const res = await fetch(
    `${QB_API}/${realmId}/query?query=${encodeURIComponent(sql)}&minorversion=65`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`QB API ${res.status}: ${text}`)
  }
  return res.json()
}

export async function isQBConnected() {
  try {
    // Connected if any QuickBooks token is saved (env realm not required).
    const { data } = await db().from('qb_tokens').select('realm_id').limit(1)
    return !!(data && data.length)
  } catch {
    return false
  }
}

/* ─── Write helpers (create customers, items, invoices) ─── */

async function qbPost(entity, body) {
  const { token, realmId } = await getQBSession()
  const res = await fetch(`${QB_API}/${realmId}/${entity}?minorversion=65`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`QB ${entity} create ${res.status}: ${text}`)
  }
  return res.json()
}

function qbEscape(s) { return String(s || '').replace(/'/g, "\\'") }

// Find a customer by display name (tries contact then company), else create one.
export async function findOrCreateCustomer({ company, contact, email, phone }) {
  for (const name of [contact, company].filter(Boolean)) {
    const q = await qbQuery(`SELECT * FROM Customer WHERE DisplayName = '${qbEscape(name)}'`)
    const found = q.QueryResponse?.Customer?.[0]
    if (found) return found
  }
  const created = await qbPost('customer', {
    DisplayName: company || contact || email,
    ...(company ? { CompanyName: company } : {}),
    ...(email ? { PrimaryEmailAddr: { Address: email } } : {}),
    ...(phone ? { PrimaryPhone: { FreeFormNumber: phone } } : {}),
  })
  return created.Customer
}

async function getIncomeAccountId() {
  const q = await qbQuery(`SELECT * FROM Account WHERE AccountType = 'Income' MAXRESULTS 1`)
  const acct = q.QueryResponse?.Account?.[0]
  if (!acct) throw new Error('No Income account found in QuickBooks')
  return acct.Id
}

// Find a service item by exact name, else create it (one per package / fee).
export async function findOrCreateItem(name, unitPrice) {
  const q = await qbQuery(`SELECT * FROM Item WHERE Name = '${qbEscape(name)}'`)
  const found = q.QueryResponse?.Item?.[0]
  if (found) return found
  const incomeId = await getIncomeAccountId()
  const created = await qbPost('item', {
    Name: name,
    Type: 'Service',
    IncomeAccountRef: { value: incomeId },
    UnitPrice: Number(unitPrice) || 0,
  })
  return created.Item
}

// Create an invoice (online payment enabled) and return the created invoice.
export async function createInvoice({ customerId, email, lines }) {
  const Line = lines.map(l => ({
    DetailType: 'SalesItemLineDetail',
    Amount: Number(l.amount) || 0,
    Description: l.description || l.name,
    SalesItemLineDetail: {
      ItemRef: { value: l.itemId },
      Qty: 1,
      UnitPrice: Number(l.amount) || 0,
    },
  }))
  const created = await qbPost('invoice', {
    CustomerRef: { value: customerId },
    Line,
    AllowOnlineACHPayment: true,
    AllowOnlineCreditCardPayment: true,
    ...(email ? { BillEmail: { Address: email } } : {}),
  })
  return created.Invoice
}

// Fetch the public shareable payment link for an invoice.
export async function getInvoiceLink(id) {
  const { token, realmId } = await getQBSession()
  const res = await fetch(`${QB_API}/${realmId}/invoice/${id}?include=invoiceLink&minorversion=65`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })
  if (!res.ok) return null
  const json = await res.json()
  return json.Invoice?.InvoiceLink || null
}
