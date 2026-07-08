-- ─────────────────────────────────────────────────────────────────────────────
-- Agent memory (architecture decision #3) — pgvector in the same Postgres.
--
-- Semantic memory for the per-client agent: things the DATABASE doesn't hold
-- — preferences, context, decisions-with-why, external facts. The rule
-- ("if a query can answer it, it's not a memory") is enforced in the app, not
-- here. Embeddings are voyage-3.5 (1024 dims). Client-visible surface (the
-- Memory tab), so same two-tier RLS as every tenant table.
--
-- Run in the Supabase SQL editor. Idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists vector;

create table if not exists public.agent_memories (
  id            uuid primary key default gen_random_uuid(),
  client_id     text not null references public.client(client_id),
  content       text not null,                    -- the memory, one fact per row
  kind          text not null default 'insight',  -- insight | preference | context | decision | external
  source        text,                             -- where it came from (e.g. "2026-06-12 call", "taught", "ledger")
  embedding     vector(1024),
  metadata      jsonb not null default '{}',
  superseded_by uuid references public.agent_memories(id),  -- corrections point here; never hard-overwrite
  created_by    uuid references public.profiles(id),        -- the human (or agent) who saved it
  created_at    timestamptz not null default now()
);

create index if not exists agent_memories_client_idx on public.agent_memories (client_id, created_at desc);
-- Cosine similarity ANN index (ivfflat). Small dataset now; lists=100 is fine.
create index if not exists agent_memories_embedding_idx
  on public.agent_memories using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- RLS: same tenant boundary as the rest (Batch 3/4 helpers). Live memories
-- (not superseded) are readable within the tenant; writes go through the
-- service-role API route, so no insert/update/delete policies for users.
alter table public.agent_memories enable row level security;
drop policy if exists "agent_memories_tenant_select" on public.agent_memories;
create policy "agent_memories_tenant_select" on public.agent_memories
  for select to authenticated
  using ((select public.can_access_client(client_id)));

-- Similarity search RPC (security definer → runs the vector match, still
-- tenant-scoped by the client_id arg the caller passes). Returns live
-- (non-superseded) memories ordered by cosine distance.
create or replace function public.match_agent_memories(
  p_client_id text,
  p_embedding vector(1024),
  p_limit int default 6
)
returns table (id uuid, content text, kind text, source text, created_at timestamptz, similarity float)
language sql stable security definer
set search_path = public
as $$
  select m.id, m.content, m.kind, m.source, m.created_at,
         1 - (m.embedding <=> p_embedding) as similarity
  from public.agent_memories m
  where m.client_id = p_client_id
    and m.superseded_by is null
    and m.embedding is not null
  order by m.embedding <=> p_embedding
  limit greatest(1, least(p_limit, 20))
$$;

grant execute on function public.match_agent_memories(text, vector, int) to authenticated, service_role;

-- Report
select 'agent_memories' as table_name,
       (select count(*) from public.agent_memories) as rows,
       (select count(*) from pg_policy p join pg_class c on c.oid = p.polrelid where c.relname = 'agent_memories') as policies;
