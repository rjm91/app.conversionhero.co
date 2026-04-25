-- Re-host Synergy HVAC funnel assets to Supabase Storage.
-- Old host (synergyhome.co/...) is no longer serving these images.
-- New home: funnel-assets bucket in project mbodzggsefkpesqcxskv.
--
-- Safe to re-run: all updates are idempotent (jsonb_set replaces in place).

-- 1. Logo — client-specific, lives under clients/{client_id}/
update client_funnels
set branding = jsonb_set(
  coalesce(branding, '{}'::jsonb),
  '{logoUrl}',
  '"https://mbodzggsefkpesqcxskv.supabase.co/storage/v1/object/public/funnel-assets/clients/ch014/synergy-logo.svg"'::jsonb
)
where slug = 'hvac-quote' and client_id = 'ch014';

-- 2. Survey-step card images — template-wide, live under templates/hvac-quote/
--    The survey step config shape is: { headline, footer, steps: [ { id, options: [ { img } ] } ] }
--    We rewrite the whole config.steps array in one pass.
update client_funnel_steps s
set config = jsonb_set(
  s.config,
  '{steps}',
  (
    select jsonb_agg(
      case
        when step->>'id' = 'intent' then jsonb_set(step, '{options}', (
          select jsonb_agg(
            case opt->>'value'
              when 'Fix (if possible)' then jsonb_set(opt, '{img}', '"https://mbodzggsefkpesqcxskv.supabase.co/storage/v1/object/public/funnel-assets/templates/hvac-quote/fix-system.png"'::jsonb)
              when 'Replace'           then jsonb_set(opt, '{img}', '"https://mbodzggsefkpesqcxskv.supabase.co/storage/v1/object/public/funnel-assets/templates/hvac-quote/replace-system.png"'::jsonb)
              else opt
            end
          )
          from jsonb_array_elements(step->'options') opt
        ))
        when step->>'id' = 'systemType' then jsonb_set(step, '{options}', (
          select jsonb_agg(
            case opt->>'label'
              when 'Heat Pump'            then jsonb_set(opt, '{img}', '"https://mbodzggsefkpesqcxskv.supabase.co/storage/v1/object/public/funnel-assets/templates/hvac-quote/heat-pump.png"'::jsonb)
              when 'Furnace + AC'         then jsonb_set(opt, '{img}', '"https://mbodzggsefkpesqcxskv.supabase.co/storage/v1/object/public/funnel-assets/templates/hvac-quote/furnace-and-ac.png"'::jsonb)
              when 'Ductless / Mini-Split' then jsonb_set(opt, '{img}', '"https://mbodzggsefkpesqcxskv.supabase.co/storage/v1/object/public/funnel-assets/templates/hvac-quote/mini-split.png"'::jsonb)
              when 'Not sure'              then jsonb_set(opt, '{img}', '"https://mbodzggsefkpesqcxskv.supabase.co/storage/v1/object/public/funnel-assets/templates/hvac-quote/space-heater-window-unit.png"'::jsonb)
              else opt
            end
          )
          from jsonb_array_elements(step->'options') opt
        ))
        else step
      end
    )
    from jsonb_array_elements(s.config->'steps') step
  )
)
from client_funnels f
where s.funnel_id = f.id
  and f.slug = 'hvac-quote'
  and f.client_id = 'ch014'
  and s.step_order = 1;

-- 3. Verify — run these manually after the updates to confirm
-- select branding->>'logoUrl' from client_funnels where slug = 'hvac-quote';
-- select jsonb_pretty(config->'steps') from client_funnel_steps s
--   join client_funnels f on f.id = s.funnel_id
--   where f.slug = 'hvac-quote' and s.step_order = 1;
