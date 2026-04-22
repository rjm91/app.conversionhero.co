create table if not exists client_domains (
  id         uuid primary key default gen_random_uuid(),
  client_id  text not null,
  domain     text not null,
  created_at timestamptz not null default now(),
  unique(client_id, domain)
);

alter table client_domains enable row level security;
