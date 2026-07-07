-- ─────────────────────────────────────────────────────────────────────────────
-- RLS Batch 1 — lock the credential tables (service-key only)
--
-- RLS ON with ZERO policies = anon and authenticated are denied everything;
-- the service role bypasses RLS, so every existing reader keeps working —
-- verified 2026-07-07: all readers of these tables are API routes / server
-- libs on the service key (lib/google-ads.js, lib/quickbooks.js, lib/meta.js,
-- lib/shopify.js, lib/blaztr-snapshot.js, app/api/*). No browser reads exist.
--
-- blaztr_daily is metrics, not credentials, but it's agency-level data with
-- no browser reader — same treatment, revisit if a browser surface needs it.
--
-- Verify after running:  node scripts/rls-verify.mjs batch1
-- Rollback (per table):  alter table public.<t> disable row level security;
-- ─────────────────────────────────────────────────────────────────────────────

-- 2026-07-07 probe: anon already sees 0 rows on all six (RLS appears to be
-- on from table creation). These statements are idempotent — they make the
-- locked state explicit and deterministic either way.
alter table public.google_ads_tokens   enable row level security;
alter table public.qb_tokens           enable row level security;
alter table public.meta_connections    enable row level security;
alter table public.shopify_connections enable row level security;
alter table public.integrations        enable row level security;
alter table public.blaztr_daily        enable row level security;

-- Drop any lingering permissive policies — these tables must be service-only.
-- (No-ops if none exist; lists first so you see what's there.)
select c.relname as "table", c.relrowsecurity as rls_on,
       p.polname as policy, pg_get_expr(p.polqual, p.polrelid) as using_expr
from pg_class c
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
left join pg_policy p on p.polrelid = c.oid
where c.relname in ('google_ads_tokens','qb_tokens','meta_connections',
                    'shopify_connections','integrations','blaztr_daily')
order by 1, 3;
