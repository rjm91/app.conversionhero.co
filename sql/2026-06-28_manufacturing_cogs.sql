-- ── Manufacturing / COGS (BOM → real per-SKU cost → margin-aware ROAS) ──────
-- Two tables mirroring the client's workbook:
--   client_materials  ← "Material Cost Per Unit" sheet (material → cost)
--   client_skus       ← "SKU INFORMATION" sheet (parent SKU → material quantities)
-- Per-client. Editable in the Manufacturing page; refreshable via CSV upload.
-- Reads go through /api/manufacturing (service role), so RLS stays locked down.
--
-- Run in the Supabase SQL Editor. Safe + transactional.

begin;

create table if not exists public.client_materials (
  id          uuid primary key default gen_random_uuid(),
  client_id   text not null references public.client(client_id) on delete cascade,
  name        text not null,                 -- material name (matches BOM refs)
  cost        numeric not null default 0,    -- cost per unit/yard
  unit        text,                          -- 'unit' | 'yard' | …
  notes       text,
  updated_at  timestamptz not null default now(),
  unique (client_id, name)
);
create index if not exists client_materials_client_idx on public.client_materials (client_id);

create table if not exists public.client_skus (
  id          uuid primary key default gen_random_uuid(),
  client_id   text not null references public.client(client_id) on delete cascade,
  parent_sku  text not null,
  size        text,
  bom         jsonb not null default '{}'::jsonb,  -- { material_key: quantity, … } verbatim from the sheet
  updated_at  timestamptz not null default now(),
  unique (client_id, parent_sku)
);
create index if not exists client_skus_client_idx on public.client_skus (client_id);

alter table public.client_materials enable row level security;
alter table public.client_skus enable row level security;
-- No client-facing policies: all access is via the service-role API route.

commit;
