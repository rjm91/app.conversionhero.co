-- Google Ads OAuth token storage (single row, id=1)
-- Persists refresh token so rotation can be handled (mirrors qb_tokens pattern)
create table if not exists google_ads_tokens (
  id            int primary key default 1,
  refresh_token text not null,
  updated_at    timestamptz default now(),
  constraint google_ads_tokens_singleton check (id = 1)
);
