'use client'

// Fleet Mission Control — the agency cockpit. Every ecom client's problems,
// 30-day economics, and recent decisions with measured impact, in one place.
// Click through to any client's full IDE. Reads the same DB the per-client
// watcher and cron write to; agency-side users only.

import Link from 'next/link'
import { useEffect, useState } from 'react'

const money = (n) => '$' + Math.round(n || 0).toLocaleString()

export default function FleetMission() {
  const [fleet, setFleet] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => {
    fetch('/api/mission/fleet', { cache: 'no-store' })
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'load failed'); return j })
      .then(setFleet)
      .catch(e => setErr(e.message))
  }, [])

  return (
    <div className="fleet">
      <style>{CSS}</style>
      <div className="f-head">
        <div>
          <span className="f-tag">AGENCY · FLEET MISSION CONTROL</span>
          <h1>Every client. One queue.</h1>
          <p className="f-sub">Open problems, 30-day economics, and measured decision impact across the ecom fleet — fed by the same watcher your per-client IDEs use.</p>
        </div>
        {fleet && (
          <div className="f-stats">
            <div className="f-stat"><span>clients</span><b>{fleet.clients.length}</b></div>
            <div className="f-stat"><span>open problems</span><b className={fleet.findings.length ? 'warn' : 'good'}>{fleet.findings.length}</b></div>
            <div className="f-stat"><span>measured impact</span><b className={fleet.measuredTotal >= 0 ? 'good' : 'bad'}>{fleet.measuredTotal >= 0 ? '+' : ''}{money(fleet.measuredTotal)}/mo</b></div>
          </div>
        )}
      </div>

      {err && <p className="f-err">{err}</p>}
      {!fleet && !err && <p className="f-dim">reading the fleet…</p>}

      {fleet && <>
        {/* client cards */}
        <div className="f-grid">
          {fleet.clients.map(c => {
            const net = c.metrics ? c.metrics.revenue - c.metrics.cogs - c.metrics.spend : null
            return (
              <Link key={c.client_id} href={`/control/${c.client_id}/mission`} className="f-card">
                <div className="f-card-h">
                  <b>{c.client_name || c.client_id}</b>
                  {c.open_problems > 0
                    ? <span className={`f-pill ${c.high_problems ? 'hot' : 'warm'}`}>⚠ {c.open_problems}</span>
                    : <span className="f-pill ok">clear</span>}
                </div>
                {c.metrics ? (
                  <div className="f-nums">
                    <div><span>rev 30d</span><b>{money(c.metrics.revenue)}</b></div>
                    <div><span>net 30d</span><b className={net >= 0 ? 'good' : 'bad'}>{money(net)}</b></div>
                    <div><span>spend</span><b>{money(c.metrics.spend)}</b></div>
                    <div><span>orders</span><b>{c.metrics.orders}</b></div>
                  </div>
                ) : <p className="f-dim">no daily metrics yet — open its IDE once (or wait for tonight's cron) to seed the rollup.</p>}
                <span className="f-open">open IDE →</span>
              </Link>
            )
          })}
          {!fleet.clients.length && <p className="f-dim">no clients flagged is_ecom=true yet.</p>}
        </div>

        {/* fleet problems */}
        <h2 className="f-h2">⚠ Problems across the fleet</h2>
        <div className="f-list">
          {fleet.findings.length === 0 && <p className="f-dim">queue is clear everywhere.</p>}
          {fleet.findings.map(f => (
            <Link key={f.id} href={`/control/${f.client_id}/mission`} className={`f-row ${f.severity === 'high' ? 'hot' : ''}`}>
              <span className="f-client">{fleet.clients.find(c => c.client_id === f.client_id)?.client_name || f.client_id}</span>
              <span className="f-title">{f.icon} {f.title}</span>
              {Number(f.impact_monthly) > 0 && <span className="f-imp">~{money(f.impact_monthly)}/mo</span>}
              <span className={`f-pill ${f.severity === 'high' ? 'hot' : 'warm'}`}>{f.severity}</span>
            </Link>
          ))}
        </div>

        {/* recent decisions */}
        <h2 className="f-h2">🧾 Recent decisions</h2>
        <div className="f-list">
          {fleet.decisions.length === 0 && <p className="f-dim">no decisions yet — approve something in a client IDE.</p>}
          {fleet.decisions.map((d, i) => (
            <div key={i} className="f-row">
              <span className="f-client">{fleet.clients.find(c => c.client_id === d.client_id)?.client_name || d.client_id}</span>
              <span className="f-title">{d.what}</span>
              <span className="f-imp dim2">{new Date(d.approved_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
              <span className={`f-imp ${d.measured?.delta_monthly > 0 ? '' : d.measured?.delta_monthly < 0 ? 'neg' : 'dim2'}`}>
                {d.measured ? (d.measured.delta_monthly != null ? `${d.measured.delta_monthly >= 0 ? '+' : ''}${money(d.measured.delta_monthly)}/mo measured` : 'n/a') : `est ${money(d.est_impact_monthly)}/mo`}
              </span>
              <span className={`f-pill ${d.status === 'executed' ? 'ok' : d.status === 'reverted' ? 'dead' : 'warm'}`}>{d.status}</span>
            </div>
          ))}
        </div>
      </>}
    </div>
  )
}

const CSS = `
.fleet{--bg:#0b0e14;--panel:#11151f;--panel2:#161b28;--line:rgba(255,255,255,.07);--txt:#dbe1ee;--dim:#8a93a8;--faint:#5a6377;--green:#3fd68f;--red:#f4747f;--amber:#e8b45a;--blue:#6ea8fe;
  min-height:100vh;margin:-2rem;padding:34px clamp(18px,5vw,70px) 80px;background:var(--bg);color:var(--txt);font:13.5px/1.55 "SF Mono",ui-monospace,Menlo,Consolas,monospace;}
.fleet .good{color:var(--green);} .fleet .warn{color:var(--amber);} .fleet .bad{color:var(--red);}
.fleet .f-head{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;flex-wrap:wrap;margin-bottom:26px;}
.fleet .f-tag{font-size:10px;font-weight:800;letter-spacing:.1em;color:var(--green);background:rgba(63,214,143,.1);border-radius:5px;padding:2px 8px;}
.fleet h1{font-size:26px;font-weight:800;margin-top:8px;}
.fleet .f-sub{color:var(--dim);font-size:12.5px;margin-top:4px;max-width:560px;}
.fleet .f-stats{display:flex;gap:12px;}
.fleet .f-stat{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:10px 16px;text-align:right;}
.fleet .f-stat span{display:block;font-size:9.5px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--faint);}
.fleet .f-stat b{font-size:18px;}
.fleet .f-err{color:var(--red);} .fleet .f-dim{color:var(--faint);font-size:12.5px;} .fleet .dim2{color:var(--faint);}
.fleet .f-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:14px;}
.fleet .f-card{display:block;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px 18px;text-decoration:none;color:var(--txt);transition:border-color .15s;}
.fleet .f-card:hover{border-color:rgba(110,168,254,.45);}
.fleet .f-card-h{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;}
.fleet .f-card-h b{font-size:14.5px;}
.fleet .f-nums{display:grid;grid-template-columns:1fr 1fr;gap:8px 14px;}
.fleet .f-nums span{display:block;font-size:9.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--faint);}
.fleet .f-nums b{font-size:14px;}
.fleet .f-open{display:inline-block;margin-top:12px;font-size:11px;color:var(--blue);}
.fleet .f-pill{font-size:9.5px;font-weight:800;border-radius:99px;padding:2px 9px;letter-spacing:.04em;}
.fleet .f-pill.hot{background:rgba(244,116,127,.13);color:var(--red);}
.fleet .f-pill.warm{background:rgba(232,180,90,.13);color:var(--amber);}
.fleet .f-pill.ok{background:rgba(63,214,143,.13);color:var(--green);}
.fleet .f-pill.dead{background:rgba(255,255,255,.08);color:var(--faint);}
.fleet .f-h2{font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--dim);margin:30px 0 10px;}
.fleet .f-list{border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--panel);}
.fleet .f-row{display:flex;gap:14px;align-items:center;padding:11px 16px;border-bottom:1px solid var(--line);text-decoration:none;color:var(--txt);font-size:12.5px;}
.fleet .f-row:last-child{border-bottom:none;}
.fleet a.f-row:hover{background:rgba(110,168,254,.05);}
.fleet .f-row.hot{border-left:3px solid var(--red);}
.fleet .f-client{width:130px;flex-shrink:0;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.fleet .f-title{flex:1;color:var(--dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.fleet .f-imp{color:var(--green);font-weight:700;white-space:nowrap;}
.fleet .f-imp.neg{color:var(--red);}
`
