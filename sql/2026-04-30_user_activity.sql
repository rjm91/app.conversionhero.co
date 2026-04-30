-- User activity log
create table if not exists user_activity (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        references auth.users(id) on delete set null,
  email      text,
  event      text        not null,  -- 'login', 'logout', 'password_reset_requested', 'password_updated', etc.
  metadata   jsonb       not null default '{}',
  ip         text,
  created_at timestamptz not null default now()
);

create index if not exists user_activity_user_id_idx    on user_activity (user_id, created_at desc);
create index if not exists user_activity_created_at_idx on user_activity (created_at desc);
create index if not exists user_activity_event_idx      on user_activity (event);

alter table user_activity enable row level security;

drop policy if exists "service role full access" on user_activity;
create policy "service role full access" on user_activity
  using (true) with check (true);
