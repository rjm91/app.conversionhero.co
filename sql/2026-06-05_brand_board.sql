-- Brand Board: per-client brand reference (colors + details).
-- Reference only — funnels keep their own styling. The agent reads this
-- when it needs the client's brand colors (e.g. building a funnel/landing page).
--
-- Shape of the branding jsonb:
-- {
--   "colors":   [ { "role": "Primary", "hex": "#2E6E42" }, ... ],  -- any number
--   "brandName": "Synergy Home",   -- optional override of client_name
--   "tagline":   "Comfort done right.",
--   "font":      "Inter"
-- }
alter table client
  add column if not exists branding jsonb not null default '{}'::jsonb;
