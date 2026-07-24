-- Instagram Messaging inbox foundation.
--
-- This is deliberately separate from meta_connections. That table belongs to
-- the existing Marketing API / ads sync; Instagram Messaging has a different
-- account identity, token lifecycle, permissions, and webhook surface.

create table if not exists public.instagram_connections (
  id                    uuid primary key default gen_random_uuid(),
  client_id             text not null unique references public.client(client_id) on delete cascade,
  instagram_account_id  text not null unique,
  page_id               text,
  username              text,
  display_name          text,
  profile_picture_url   text,
  access_token          text not null,
  token_expires_at      timestamptz,
  permissions           text[] not null default '{}',
  human_agent_enabled   boolean not null default false,
  status                text not null default 'connected'
                        check (status in ('connected', 'disconnected', 'error')),
  webhook_subscribed_at timestamptz,
  last_error_code       text,
  last_error_at         timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Credentials are never browser-readable. Server routes and the webhook use
-- the service role, which bypasses RLS.
alter table public.instagram_connections enable row level security;
revoke all on public.instagram_connections from anon, authenticated;

create table if not exists public.instagram_conversations (
  id                         uuid primary key default gen_random_uuid(),
  client_id                  text not null references public.client(client_id) on delete cascade,
  instagram_account_id       text not null,
  instagram_scoped_user_id   text not null,
  thread_id                  text,
  username                   text,
  display_name               text,
  profile_picture_url        text,
  first_message_at           timestamptz not null,
  last_message_at            timestamptz not null,
  last_inbound_at            timestamptz,
  messaging_window_expires_at timestamptz,
  human_agent_window_expires_at timestamptz,
  last_message_preview       text,
  last_message_direction     text check (last_message_direction in ('inbound', 'outbound')),
  unread_count               integer not null default 0 check (unread_count >= 0),
  source_type                text,
  source_label               text,
  source_ref                 text,
  meta_campaign_id           text,
  meta_adset_id              text,
  meta_ad_id                 text,
  native_referral            jsonb not null default '{}'::jsonb,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  unique (client_id, instagram_account_id, instagram_scoped_user_id)
);

create unique index if not exists instagram_conversations_thread_unique
  on public.instagram_conversations (client_id, instagram_account_id, thread_id)
  where thread_id is not null;
create index if not exists instagram_conversations_client_recent_idx
  on public.instagram_conversations (client_id, last_message_at desc);
create index if not exists instagram_conversations_igsid_idx
  on public.instagram_conversations (instagram_account_id, instagram_scoped_user_id);

create table if not exists public.instagram_messages (
  id                    uuid primary key default gen_random_uuid(),
  client_id             text not null references public.client(client_id) on delete cascade,
  conversation_id       uuid not null references public.instagram_conversations(id) on delete cascade,
  instagram_message_id  text,
  sender_id             text not null,
  recipient_id          text not null,
  direction             text not null check (direction in ('inbound', 'outbound')),
  message_text          text,
  attachments           jsonb not null default '[]'::jsonb,
  sent_at               timestamptz not null,
  is_read               boolean not null default false,
  status                text not null default 'received'
                        check (status in ('received', 'sent', 'failed', 'deleted', 'unsupported')),
  reply_to_message_id   text,
  source_type           text,
  source_ref            text,
  meta_campaign_id      text,
  meta_adset_id         text,
  meta_ad_id             text,
  native_referral       jsonb not null default '{}'::jsonb,
  error_code            text,
  error_message         text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create unique index if not exists instagram_messages_meta_id_unique
  on public.instagram_messages (client_id, instagram_message_id)
  where instagram_message_id is not null;
create index if not exists instagram_messages_thread_idx
  on public.instagram_messages (client_id, conversation_id, sent_at);

-- One transaction per webhook message: creates the thread if necessary,
-- deduplicates by Meta message id, and only then advances unread/preview state.
create or replace function public.ingest_instagram_message(
  p_client_id text,
  p_instagram_account_id text,
  p_igsid text,
  p_thread_id text,
  p_username text,
  p_display_name text,
  p_profile_picture_url text,
  p_message_id text,
  p_sender_id text,
  p_recipient_id text,
  p_direction text,
  p_message_text text,
  p_attachments jsonb,
  p_sent_at timestamptz,
  p_status text,
  p_reply_to_message_id text,
  p_source_type text,
  p_source_label text,
  p_source_ref text,
  p_campaign_id text,
  p_adset_id text,
  p_ad_id text,
  p_native_referral jsonb
)
returns table (conversation_id uuid, message_inserted boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation_id uuid;
  v_message_id uuid;
begin
  insert into public.instagram_conversations (
    client_id, instagram_account_id, instagram_scoped_user_id, thread_id,
    username, display_name, profile_picture_url, first_message_at, last_message_at,
    last_inbound_at, messaging_window_expires_at, human_agent_window_expires_at,
    last_message_preview, last_message_direction, unread_count, source_type,
    source_label, source_ref, meta_campaign_id, meta_adset_id, meta_ad_id,
    native_referral
  ) values (
    p_client_id, p_instagram_account_id, p_igsid, p_thread_id,
    p_username, p_display_name, p_profile_picture_url, p_sent_at, p_sent_at,
    case when p_direction = 'inbound' then p_sent_at end,
    case when p_direction = 'inbound' then p_sent_at + interval '24 hours' end,
    case when p_direction = 'inbound' then p_sent_at + interval '7 days' end,
    left(coalesce(nullif(p_message_text, ''), '[attachment]'), 240),
    p_direction, 0, p_source_type, p_source_label, p_source_ref,
    p_campaign_id, p_adset_id, p_ad_id, coalesce(p_native_referral, '{}'::jsonb)
  )
  on conflict (client_id, instagram_account_id, instagram_scoped_user_id)
  do update set
    thread_id = coalesce(instagram_conversations.thread_id, excluded.thread_id),
    username = coalesce(excluded.username, instagram_conversations.username),
    display_name = coalesce(excluded.display_name, instagram_conversations.display_name),
    profile_picture_url = coalesce(excluded.profile_picture_url, instagram_conversations.profile_picture_url),
    source_type = coalesce(instagram_conversations.source_type, excluded.source_type),
    source_label = coalesce(instagram_conversations.source_label, excluded.source_label),
    source_ref = coalesce(instagram_conversations.source_ref, excluded.source_ref),
    meta_campaign_id = coalesce(instagram_conversations.meta_campaign_id, excluded.meta_campaign_id),
    meta_adset_id = coalesce(instagram_conversations.meta_adset_id, excluded.meta_adset_id),
    meta_ad_id = coalesce(instagram_conversations.meta_ad_id, excluded.meta_ad_id),
    native_referral = case
      when instagram_conversations.native_referral = '{}'::jsonb
        then excluded.native_referral
      else instagram_conversations.native_referral
    end,
    updated_at = now()
  returning id into v_conversation_id;

  insert into public.instagram_messages (
    client_id, conversation_id, instagram_message_id, sender_id, recipient_id,
    direction, message_text, attachments, sent_at, is_read, status,
    reply_to_message_id, source_type, source_ref, meta_campaign_id,
    meta_adset_id, meta_ad_id, native_referral
  ) values (
    p_client_id, v_conversation_id, p_message_id, p_sender_id, p_recipient_id,
    p_direction, p_message_text, coalesce(p_attachments, '[]'::jsonb), p_sent_at,
    false, p_status, p_reply_to_message_id, p_source_type,
    p_source_ref, p_campaign_id, p_adset_id, p_ad_id,
    coalesce(p_native_referral, '{}'::jsonb)
  )
  on conflict (client_id, instagram_message_id)
    where instagram_message_id is not null
  do nothing
  returning id into v_message_id;

  if v_message_id is not null then
    update public.instagram_conversations
    set
      first_message_at = least(first_message_at, p_sent_at),
      last_message_at = greatest(last_message_at, p_sent_at),
      last_message_preview = case when p_sent_at >= last_message_at
        then left(coalesce(nullif(p_message_text, ''), '[attachment]'), 240)
        else last_message_preview end,
      last_message_direction = case when p_sent_at >= last_message_at
        then p_direction else last_message_direction end,
      unread_count = unread_count + case when p_direction = 'inbound' then 1 else 0 end,
      last_inbound_at = case when p_direction = 'inbound'
        then greatest(coalesce(last_inbound_at, p_sent_at), p_sent_at)
        else last_inbound_at end,
      messaging_window_expires_at = case when p_direction = 'inbound'
        then greatest(coalesce(messaging_window_expires_at, p_sent_at + interval '24 hours'), p_sent_at + interval '24 hours')
        else messaging_window_expires_at end,
      human_agent_window_expires_at = case when p_direction = 'inbound'
        then greatest(coalesce(human_agent_window_expires_at, p_sent_at + interval '7 days'), p_sent_at + interval '7 days')
        else human_agent_window_expires_at end,
      updated_at = now()
    where id = v_conversation_id;
  end if;

  return query select v_conversation_id, (v_message_id is not null);
end
$$;

revoke all on function public.ingest_instagram_message(
  text, text, text, text, text, text, text, text, text, text, text, text,
  jsonb, timestamptz, text, text, text, text, text, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.ingest_instagram_message(
  text, text, text, text, text, text, text, text, text, text, text, text,
  jsonb, timestamptz, text, text, text, text, text, text, text, text, jsonb
) to service_role;

alter table public.instagram_conversations enable row level security;
alter table public.instagram_messages enable row level security;

drop policy if exists instagram_conversations_tenant_select on public.instagram_conversations;
create policy instagram_conversations_tenant_select
  on public.instagram_conversations for select to authenticated
  using ((select public.can_access_client(client_id)));

drop policy if exists instagram_messages_tenant_select on public.instagram_messages;
create policy instagram_messages_tenant_select
  on public.instagram_messages for select to authenticated
  using ((select public.can_access_client(client_id)));

grant select on public.instagram_conversations to authenticated;
grant select on public.instagram_messages to authenticated;
revoke insert, update, delete on public.instagram_conversations from anon, authenticated;
revoke insert, update, delete on public.instagram_messages from anon, authenticated;

-- Explicit product capability flag. Generic Mission code reads this setting;
-- it does not branch on a display name. The additional vertical predicate
-- protects against accidentally enabling a recycled client id.
update public.client
set settings = jsonb_set(
  coalesce(settings, '{}'::jsonb),
  '{instagram_conversations_enabled}',
  'true'::jsonb,
  true
)
where client_id = 'ch1001'
  and coalesce(settings->>'vertical', '') = 'esthetician';
