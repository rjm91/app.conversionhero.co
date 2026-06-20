-- Dev Board / roadmap — internal, agency-admin only.
-- Accessed only through the service-role API (/api/roadmap), so RLS stays locked
-- (no anon/auth policies) like other agency-write tables.

create table if not exists dev_roadmap (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  notes       text,
  status      text not null default 'next',   -- now | next | later | done
  priority    text,                           -- P0 | P1 | P2 | P3 | null
  blocked     boolean not null default false,
  blocked_on  text,
  sort_order  int not null default 0,
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table dev_roadmap enable row level security;
-- No policies = locked to service-role only (the guarded API).

-- Seed from the current backlog (docs/internal/roadmap.md). Safe to edit/delete after.
insert into dev_roadmap (title, status, priority, blocked, blocked_on, notes, sort_order) values
  ('Meta — reconnect ShieldTech', 'now', 'P0', true, 'Jason sending new ad account ID + System User token', 'Enter creds in the connection manager → Test → Save → Sync.', 10),
  ('Fix Google banner wording', 'now', 'P1', false, null, 'integration-health hardcodes "reconnect Google Ads" for any 401; surface the real error.', 20),
  ('Sweep for ===''agency_admin'' exact checks', 'now', 'P1', false, null, 'Find spots that exclude agency_admin_security (today''s switcher/toggle bug was one).', 30),
  ('Voice-fill rollout (next pages)', 'next', 'P2', false, null, 'Manufacturing → Leads/CRM → Funnels → Brand board → Calendar → Create user.', 10),
  ('Widen CH-column campaign table', 'next', 'P2', false, null, 'min-w-[900px] → ~1180px; headers crowd at 15 cols.', 20),
  ('Agent Access registry v2 (kill switches)', 'next', 'P2', false, null, 'Per-capability on/off toggles. v1 is read-only.', 30),
  ('Retire standalone payment mic', 'next', 'P3', false, null, '/api/parse-payment + modal mic superseded by agent proposePayment.', 40),
  ('Meta App Review → real FB Ads tab', 'later', 'P2', true, 'Meta App Review', 'Mirror the Google MCC setup in the Paid Ads tab.', 10),
  ('Health-monitoring cron + alerts', 'later', 'P2', false, null, 'Scheduled ad-account health check + recovery email, not just on dashboard load.', 20),
  ('Roll Manufacturing tab beyond ch069', 'later', 'P3', false, null, 'If validated with ShieldTech.', 30),
  ('Agent Access registry v3 (usage/audit)', 'later', 'P3', false, null, null, 40),
  ('"Why not GoHighLevel" comparison', 'later', 'P3', false, null, 'Competitor analysis + live search.', 50),
  ('Headline rework', 'later', 'P3', false, null, 'Replace "quadrisection of talent, skill & capabilities".', 60),
  ('Google Ads 401 fix (Next fetch cache)', 'done', 'P0', false, null, 'cache:no-store on OAuth exchange + API calls.', 10),
  ('Meta self-serve connection manager', 'done', 'P1', false, null, null, 20),
  ('Banner → amber "waiting on credentials"', 'done', 'P2', false, null, null, 30),
  ('Fix agency controls name collision', 'done', 'P1', false, null, null, 40),
  ('Agent Access registry v1', 'done', 'P2', false, null, null, 50),
  ('agency_admin_security role + Team & Roles', 'done', 'P2', false, null, null, 60);
