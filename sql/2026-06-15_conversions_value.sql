-- Platform-reported conversion value (revenue) so we can show each platform's
-- own ROAS (value ÷ spend) next to the CH-attributed ROAS.
-- Google = metrics.conversions_value; Meta = insights action_values (purchase).

alter table client_yt_campaigns
  add column if not exists conversions_value numeric default 0;

alter table client_meta_campaigns
  add column if not exists conversions_value numeric default 0;
