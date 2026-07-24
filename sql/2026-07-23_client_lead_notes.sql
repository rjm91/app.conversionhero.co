-- Per-lead CRM activity. Notes and manually logged messages remain in the
-- tenant's Mission workspace and retain the author/timestamp as a history.

create table if not exists public.client_lead_notes (
  id              uuid primary key default gen_random_uuid(),
  client_id       text not null references public.client(client_id) on delete cascade,
  lead_id         text not null references public.client_lead(lead_id) on delete cascade,
  entry_type      text not null default 'note'
                  check (entry_type in ('note', 'message')),
  body            text not null check (char_length(trim(body)) > 0),
  created_by      uuid references public.profiles(id) on delete set null,
  created_by_name text,
  created_at      timestamptz not null default now()
);

create index if not exists client_lead_notes_client_lead_created_idx
  on public.client_lead_notes (client_id, lead_id, created_at desc);

alter table public.client_lead_notes enable row level security;

drop policy if exists client_lead_notes_tenant_select on public.client_lead_notes;
create policy client_lead_notes_tenant_select on public.client_lead_notes
  for select to authenticated
  using ((select public.can_access_client(client_id)));

drop policy if exists client_lead_notes_tenant_insert on public.client_lead_notes;
create policy client_lead_notes_tenant_insert on public.client_lead_notes
  for insert to authenticated
  with check ((select public.can_access_client(client_id)));

grant select, insert on public.client_lead_notes to authenticated;
revoke all on public.client_lead_notes from anon;
revoke update, delete on public.client_lead_notes from authenticated;
