-- Plans — personal forward planner (stays / trips) for the Control Center
-- Run in Supabase SQL editor. Safe to re-run.

-- ─── plans (one row = one stay) ──────────────────────────────────────────────
create table if not exists plans (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,                       -- lodging name, e.g. "Old Town Loft"
  city         text,                                -- "Scottsdale, AZ"
  url          text,                                -- Airbnb / listing link
  color        text not null default '#7c5cff',     -- bar color on the timeline
  start_date   date not null,                       -- check-in
  end_date     date not null,                       -- check-out
  categories   jsonb not null default '{"airbnb":0,"food":0,"personal":0,"fun":0}'::jsonb,
  flight_route text,                                -- "SAN → PHX" (flight in)
  flight_date  date,                                -- date of the flight in
  notes        text,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create index if not exists plans_start_idx on plans(start_date);

-- ─── RLS (service-role only — personal owner UI, same pattern as projects) ───
alter table plans enable row level security;

drop policy if exists "plans_open" on plans;
create policy "plans_open" on plans for all using (true) with check (true);

-- ─── Seed the two stays from the original "Personal Plans June 2026" note ────
insert into plans (name, city, url, color, start_date, end_date, categories, flight_route, flight_date)
select * from (values
  ('Old Town Loft',     'Scottsdale, AZ', null, '#7c5cff', date '2026-06-09', date '2026-06-16',
     '{"airbnb":628,"food":150,"personal":80,"fun":120}'::jsonb, 'SAN → PHX', date '2026-06-09'),
  ('Chandler Pool Room','Chandler, AZ',   null, '#2dd4bf', date '2026-06-17', date '2026-06-30',
     '{"airbnb":669,"food":280,"personal":120,"fun":200}'::jsonb, null, null)
) as v(name, city, url, color, start_date, end_date, categories, flight_route, flight_date)
where not exists (select 1 from plans);
