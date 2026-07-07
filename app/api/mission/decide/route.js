import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '../../../../lib/supabase-server'
import { userCanAccessClient } from '../../../../lib/access'
import { snapshotBaseline } from '../../../../lib/mission/server'
import { executeLever } from '../../../../lib/mission/levers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// POST /api/mission/decide — every human decision flows through here.
// actions:
//   draft   {client_id, finding}                 → new open finding (from /pause, /scale, or the agent)
//   approve {client_id, finding_key}             → finding approved + decision row + lever (per MISSION_LEVERS)
//   dismiss {client_id, finding_key, reason}     → finding dismissed + standing policy
//   undo    {client_id, decision_id}             → decision reverted, finding reopened
export async function POST(request) {
  const ssr = createServerClient()
  const { data: { user } } = await ssr.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const { client_id: clientId, action } = body || {}
  if (!clientId || !action) return NextResponse.json({ error: 'client_id and action required' }, { status: 400 })
  if (!await userCanAccessClient(user.id, clientId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const db = admin()
  const now = new Date().toISOString()
  const who = user.email || user.id

  try {
    if (action === 'draft') {
      const f = body.finding
      if (!f?.id || !f?.title) return NextResponse.json({ error: 'finding with id + title required' }, { status: 400 })
      const { data, error } = await db.from('mission_findings').upsert({
        client_id: clientId, finding_key: f.id,
        severity: f.severity || 'medium', icon: f.icon || '🤖', title: f.title, why: f.why || '',
        impact_monthly: Math.round(Number(f.impactMonthly) || 0), confidence: f.confidence || 'medium',
        evidence: f.evidence || [], action: f.action || { ledger: f.title },
        status: 'open', source: f.id.startsWith('agent-') ? 'agent' : 'command', last_seen: now, resolved_at: null,
      }, { onConflict: 'client_id,finding_key' }).select().single()
      if (error) throw error
      return NextResponse.json({ finding: data })
    }

    if (action === 'approve') {
      const key = body.finding_key
      const { data: f, error: fe } = await db.from('mission_findings')
        .select('*').eq('client_id', clientId).eq('finding_key', key).single()
      if (fe || !f) return NextResponse.json({ error: 'finding not found' }, { status: 404 })
      if (f.status !== 'open') return NextResponse.json({ error: `finding is ${f.status}, not open` }, { status: 409 })

      const baseline = await snapshotBaseline(db, clientId)
      const execution = await executeLever(db, clientId, { action: f.action })
      const status = execution.executed ? 'executed' : execution.mode === 'dry_run' && execution.request ? 'dry_run' : 'logged'

      await db.from('mission_findings').update({ status: 'approved', decided_at: now, decided_by: who }).eq('id', f.id)
      const { data: decision, error: de } = await db.from('mission_decisions').insert({
        client_id: clientId, finding_key: key,
        what: f.action?.ledger || f.title,
        est_impact_monthly: f.impact_monthly,
        status, finding: f, baseline, execution,
        approved_by: who, approved_at: now,
      }).select().single()
      if (de) throw de
      return NextResponse.json({ decision, execution })
    }

    if (action === 'dismiss') {
      const key = body.finding_key
      const reason = (body.reason || '').trim() || 'no reason given'
      const { error: ue } = await db.from('mission_findings')
        .update({ status: 'dismissed', decided_at: now, decided_by: who, teach_reason: reason })
        .eq('client_id', clientId).eq('finding_key', key).eq('status', 'open')
      if (ue) throw ue
      const { data: policy, error: pe } = await db.from('mission_policies').insert({
        client_id: clientId, finding_key: key, reason, taught_by: who,
      }).select().single()
      if (pe) throw pe
      return NextResponse.json({ policy })
    }

    if (action === 'undo') {
      const { data: d, error: de } = await db.from('mission_decisions')
        .select('*').eq('client_id', clientId).eq('id', body.decision_id).single()
      if (de || !d) return NextResponse.json({ error: 'decision not found' }, { status: 404 })
      if (d.status === 'reverted') return NextResponse.json({ error: 'already reverted' }, { status: 409 })
      await db.from('mission_decisions').update({ status: 'reverted' }).eq('id', d.id)
      const { data: finding, error: fe } = await db.from('mission_findings')
        .update({ status: 'open', decided_at: null, decided_by: null, last_seen: now, resolved_at: null })
        .eq('client_id', clientId).eq('finding_key', d.finding_key).select().single()
      if (fe) throw fe
      // NOTE: undo reverts the LOG. If the lever ran live, reversing the
      // platform change is a separate manual step (rollback info is in
      // decision.execution.rollback) — surfaced to the user client-side.
      return NextResponse.json({ finding, decision: { ...d, status: 'reverted' } })
    }

    return NextResponse.json({ error: `unknown action ${action}` }, { status: 400 })
  } catch (e) {
    console.error('[mission/decide]', e)
    return NextResponse.json({ error: e.message || 'decide failed' }, { status: 500 })
  }
}
