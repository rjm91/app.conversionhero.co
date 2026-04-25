-- V2: straight text-replace approach (more robust than CASE matching).
-- Converts jsonb to text, swaps old URLs for new, casts back to jsonb.
-- Safe to re-run.

update client_funnel_steps s
set config = (
  replace(
  replace(
  replace(
  replace(
  replace(
  replace(
    s.config::text,
    'https://synergyhome.co/get-quote/hvac/assets/FIX-NEW-2.png',
    'https://mbodzggsefkpesqcxskv.supabase.co/storage/v1/object/public/funnel-assets/templates/hvac-quote/fix-system.png'),
    'https://synergyhome.co/get-quote/hvac/assets/REPLACE-NEW-2.png',
    'https://mbodzggsefkpesqcxskv.supabase.co/storage/v1/object/public/funnel-assets/templates/hvac-quote/replace-system.png'),
    'https://synergyhome.co/assets/hvac-survey/heat-pump.png',
    'https://mbodzggsefkpesqcxskv.supabase.co/storage/v1/object/public/funnel-assets/templates/hvac-quote/heat-pump.png'),
    'https://synergyhome.co/assets/hvac-survey/furnace-and-ac.png',
    'https://mbodzggsefkpesqcxskv.supabase.co/storage/v1/object/public/funnel-assets/templates/hvac-quote/furnace-and-ac.png'),
    'https://synergyhome.co/assets/hvac-survey/mini-split.png',
    'https://mbodzggsefkpesqcxskv.supabase.co/storage/v1/object/public/funnel-assets/templates/hvac-quote/mini-split.png'),
    'https://synergyhome.co/assets/hvac-survey/spaceHeater-windowUnit.png',
    'https://mbodzggsefkpesqcxskv.supabase.co/storage/v1/object/public/funnel-assets/templates/hvac-quote/space-heater-window-unit.png'
  )
)::jsonb
from client_funnels f
where s.funnel_id = f.id
  and f.slug = 'hvac-quote'
  and s.step_order = 1;

-- Verify — paste this after running the update
-- select jsonb_pretty(config->'steps') from client_funnel_steps s
--   join client_funnels f on f.id = s.funnel_id
--   where f.slug = 'hvac-quote' and s.step_order = 1;
