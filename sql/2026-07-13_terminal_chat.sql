-- ─────────────────────────────────────────────────────────────────────────────
-- terminal_chat — DURABLE PER-USER TERMINAL CHAT HISTORY.
--
-- The mission "terminal" (agency + per-client Business IDE) kept its whole
-- conversation in React state, so a refresh wiped it. This table persists every
-- real turn keyed to the logged-in user so the terminal reloads its current
-- conversation on mount, and past conversations (grouped by session_id) are
-- browsable Cursor/ChatGPT style.
--
-- Scoped strictly to the user who wrote the row (RLS: user_id = auth.uid()).
-- `surface` is 'agency' for the agency terminal, or the client_id (e.g. 'ch069')
-- for a per-client terminal. Persistence is fail-safe on the client: if this
-- table is missing the terminal silently falls back to in-memory behavior.
-- Safe to re-run. Run in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.terminal_chat (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,                 -- the auth user who owns this turn
  surface     text not null,                 -- 'agency' | client_id
  session_id  uuid not null,                 -- groups a conversation
  role        text not null check (role in ('user','agent','system')),
  content     text,
  actions     jsonb,                          -- optional: agent tool actions taken that turn (audit)
  created_at  timestamptz not null default now()
);

create index if not exists terminal_chat_session_idx
  on public.terminal_chat (user_id, surface, session_id, created_at);
create index if not exists terminal_chat_recent_idx
  on public.terminal_chat (user_id, surface, created_at desc);

alter table public.terminal_chat enable row level security;

drop policy if exists "terminal_chat_own_select" on public.terminal_chat;
create policy "terminal_chat_own_select" on public.terminal_chat
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "terminal_chat_own_insert" on public.terminal_chat;
create policy "terminal_chat_own_insert" on public.terminal_chat
  for insert to authenticated
  with check (user_id = auth.uid());

select 'terminal_chat' as table_name,
       (select count(*) from public.terminal_chat) as rows,
       (select count(*) from pg_policy p join pg_class c on c.oid = p.polrelid where c.relname = 'terminal_chat') as policies;
