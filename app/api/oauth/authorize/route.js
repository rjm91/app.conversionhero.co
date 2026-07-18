// Authorization endpoint — the ONE human gate. GET renders a tiny approval
// page asking for the shared access key; POST validates it and redirects back
// to the client with a short-lived signed code (PKCE challenge embedded).
import { NextResponse } from 'next/server'
import { sign, verify } from '../../../../lib/mcp-oauth'
export const dynamic = 'force-dynamic'

const page = (params, err) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Authorize data access</title>
<body style="margin:0;background:#0b0e14;color:#dbe1ee;font-family:ui-monospace,Menlo,monospace;display:grid;place-items:center;min-height:100vh;">
<form method="POST" style="background:#12161f;border:1px solid rgba(255,255,255,.09);border-radius:12px;padding:28px 30px;width:340px;">
  <div style="font-weight:800;font-size:15px;margin-bottom:6px;">ConversionHero · data access</div>
  <div style="color:#8a93a8;font-size:12px;line-height:1.6;margin-bottom:16px;">An external agent is requesting READ-ONLY access to ShieldTech's P&amp;L data. Enter the access key to approve.</div>
  ${err ? `<div style="color:#ff6b6b;font-size:12px;margin-bottom:10px;">${err}</div>` : ''}
  ${Object.entries(params).map(([k, v]) => `<input type="hidden" name="${k}" value="${String(v).replace(/"/g, '&quot;')}">`).join('')}
  <input name="key" type="password" placeholder="access key" autofocus style="width:100%;box-sizing:border-box;background:#0b0e14;border:1px solid rgba(255,255,255,.15);border-radius:7px;color:#dbe1ee;font:inherit;padding:9px 11px;margin-bottom:12px;">
  <button style="width:100%;background:#6ea8fe;border:none;border-radius:7px;color:#0b1220;font:inherit;font-weight:800;padding:9px;cursor:pointer;">Approve</button>
</form></body>`

const pick = (sp) => ({
  client_id: sp.get('client_id') || '', redirect_uri: sp.get('redirect_uri') || '',
  state: sp.get('state') || '', code_challenge: sp.get('code_challenge') || '',
  code_challenge_method: sp.get('code_challenge_method') || '', scope: sp.get('scope') || 'read',
})

export async function GET(request) {
  const p = pick(new URL(request.url).searchParams)
  const client = verify(p.client_id)
  if (!client || client.t !== 'client' || !client.redirect_uris.includes(p.redirect_uri)) {
    return new Response('invalid client_id or redirect_uri', { status: 400 })
  }
  return new Response(page(p), { headers: { 'content-type': 'text/html' } })
}

export async function POST(request) {
  const form = await request.formData()
  const sp = new URLSearchParams()
  for (const [k, v] of form.entries()) sp.set(k, String(v))
  const p = pick(sp)
  const client = verify(p.client_id)
  if (!client || client.t !== 'client' || !client.redirect_uris.includes(p.redirect_uri)) {
    return new Response('invalid client_id or redirect_uri', { status: 400 })
  }
  if (String(form.get('key') || '').trim() !== String(process.env.CHORUS_MCP_KEY || '').trim()) {
    return new Response(page(p, 'Wrong key — try again.'), { status: 401, headers: { 'content-type': 'text/html' } })
  }
  const code = sign({ t: 'code', redirect_uri: p.redirect_uri, code_challenge: p.code_challenge, exp: Date.now() + 5 * 60 * 1000 })
  const to = new URL(p.redirect_uri)
  to.searchParams.set('code', code)
  if (p.state) to.searchParams.set('state', p.state)
  return NextResponse.redirect(to.toString(), 302)
}
