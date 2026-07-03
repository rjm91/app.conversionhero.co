-- Klaviyo entity status: campaigns report Sent/Draft/Scheduled/…, flows report
-- live/draft/manual. Synced by /api/sync-klaviyo from the entity attributes.
alter table public.client_klaviyo_campaigns add column if not exists status text;
