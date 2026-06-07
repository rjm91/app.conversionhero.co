-- Google Ads Campaign Builder drafts.
-- One working draft per client for v1 (client_id is the key). The whole
-- builder document (campaigns → ad groups → keywords + ads) lives in `doc`.
--
-- doc shape:
-- {
--   "campaigns": [{
--     "id","name","status","bidStrategy","trackingTemplate",
--     "adGroups": [{
--       "id","name",
--       "keywords": [{ "id","text","matchType" }],
--       "ads":      [{ "id","adType","headlines":[{"text","position"}],
--                      "descriptions":[{"text","position"}],"path1","path2","finalUrl" }]
--     }]
--   }]
-- }
create table if not exists client_campaign_drafts (
  client_id   text primary key,
  doc         jsonb not null default '{"campaigns":[]}'::jsonb,
  updated_at  timestamptz not null default now()
);
