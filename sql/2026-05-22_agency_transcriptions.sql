-- Agency transcriptions table
-- Run this in Supabase SQL editor

create table if not exists agency_transcriptions (
  id uuid primary key default gen_random_uuid(),
  title text,
  source_type text not null check (source_type in ('youtube', 'upload')),
  source_url text,                    -- YouTube URL (null for uploads)
  file_name text,                     -- original filename (null for YouTube)
  duration_seconds int,
  transcript text,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'error')),
  assemblyai_id text,                 -- AssemblyAI transcript ID for polling
  error_message text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists agency_transcriptions_created_idx
  on agency_transcriptions(created_at desc);

-- RLS
alter table agency_transcriptions enable row level security;

drop policy if exists "transcriptions_read" on agency_transcriptions;
create policy "transcriptions_read"
  on agency_transcriptions for select using (true);

drop policy if exists "transcriptions_insert" on agency_transcriptions;
create policy "transcriptions_insert"
  on agency_transcriptions for insert with check (true);

drop policy if exists "transcriptions_update" on agency_transcriptions;
create policy "transcriptions_update"
  on agency_transcriptions for update using (true);

drop policy if exists "transcriptions_delete" on agency_transcriptions;
create policy "transcriptions_delete"
  on agency_transcriptions for delete using (true);
