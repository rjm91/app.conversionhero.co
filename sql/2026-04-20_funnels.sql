-- Run this in Supabase SQL editor

-- 1. Extend client_funnels with schema + routing fields
alter table client_funnels
  add column if not exists slug text unique,
  add column if not exists service text,                    -- 'hvac' | 'generator' | 'solar' | 'roofing' | ...
  add column if not exists config jsonb,                    -- full survey schema (branding, steps, etc.)
  add column if not exists is_template boolean default false,
  add column if not exists template_source_id uuid references client_funnels(id),
  add column if not exists custom_domain text;              -- e.g. 'synergyhome.co' (for host-based routing later)

create index if not exists client_funnels_slug_idx on client_funnels(slug);
create index if not exists client_funnels_domain_idx on client_funnels(custom_domain);

-- 2. Tracking events (visits, step-views) for conversion analytics
--    Leads themselves go to client_lead / client_lead_meta — this is purely for
--    page-view and step-view analytics (the tracking pixel we'll build later).
create table if not exists funnel_events (
  id bigserial primary key,
  funnel_id uuid references client_funnels(id) on delete cascade,
  client_id text references client(client_id),
  event_type text not null,                                 -- 'page_view' | 'step_view' | 'lead_submit'
  step_id text,
  session_id text,
  lead_id text,                                             -- matches client_lead.lead_id
  utm_source text, utm_medium text, utm_campaign text, utm_content text,
  gclid text, wbraid text,
  user_agent text,
  created_at timestamptz default now()
);

create index if not exists funnel_events_funnel_idx on funnel_events(funnel_id, created_at desc);

-- 3. Seed: Synergy HVAC funnel (transcribed from hostgator /get-quote/hvac/)
insert into client_funnels (client_id, slug, name, service, status, is_template, config)
values (
  'ch014',                                                  -- Synergy Home
  'hvac-quote',
  'Synergy Home — HVAC Second Opinion',
  'hvac',
  'live',
  false,
  $json${
    "branding": {
      "logoUrl": "https://synergyhome.co/assets/synergy-home-logo.png",
      "primaryColor": "#2e6e42",
      "primaryColorHover": "#245737",
      "primaryColorLight": "#e8f5ed",
      "thankYouUrl": "https://synergyhome.co/ty"
    },
    "tracking": { "gtagId": "AW-11226847730" },
    "headline": {
      "eyebrow": "Lexington & Bluegrass Area Homeowners:",
      "title": "Don't Buy A New HVAC System Without a Free Second Opinion From Synergy Home"
    },
    "footer": {
      "companyName": "Synergy Home LLC",
      "privacyUrl": "https://synergyhome.co/privacy-policy",
      "termsUrl": "https://synergyhome.co/terms"
    },
    "steps": [
      {
        "id": "intent",
        "question": "Would you Like To Fix or Replace Your HVAC System?",
        "type": "cards", "cols": 2, "autoNext": true,
        "options": [
          { "label": "Fix System (If Possible)", "value": "Fix (if possible)", "img": "https://synergyhome.co/get-quote/hvac/assets/FIX-NEW-2.png" },
          { "label": "Replace System", "value": "Replace", "img": "https://synergyhome.co/get-quote/hvac/assets/REPLACE-NEW-2.png" }
        ]
      },
      {
        "id": "systemType",
        "question": "What Type Of HVAC System Do You Have?",
        "type": "cards", "cols": 4, "autoNext": true,
        "options": [
          { "label": "Heat Pump", "value": "Heat Pump (heats & cools)", "img": "https://synergyhome.co/assets/hvac-survey/heat-pump.png" },
          { "label": "Furnace + AC", "value": "Furnace + AC (separate systems)", "img": "https://synergyhome.co/assets/hvac-survey/furnace-and-ac.png" },
          { "label": "Ductless / Mini-Split", "value": "Ductless / Mini-Split", "img": "https://synergyhome.co/assets/hvac-survey/mini-split.png" },
          { "label": "Not sure", "value": "Not sure", "img": "https://synergyhome.co/assets/hvac-survey/spaceHeater-windowUnit.png" }
        ]
      },
      {
        "id": "systemAge",
        "question": "How Old Is Your System?",
        "type": "list", "autoNext": true,
        "options": [
          { "label": "Less than 3 years (New)", "value": "Less than 3 years", "icon": "✨" },
          { "label": "3-7 years (Mid-Age)", "value": "3-7 years", "icon": "📅" },
          { "label": "7-12 years (Old)", "value": "7-12 years", "icon": "🕐" },
          { "label": "12+ years (outdated)", "value": "12+ years", "icon": "⚠️" },
          { "label": "I don't know", "value": "I don't know", "icon": "❔" }
        ]
      },
      {
        "id": "zip",
        "question": "What Is Your Zip Code?",
        "type": "text",
        "field": { "name": "zip", "label": "ZIP Code", "placeholder": "12345", "inputmode": "numeric", "maxlength": 10 },
        "cta": "Next"
      },
      {
        "id": "contact",
        "question": "Last Step - How Can We Reach You?",
        "type": "contact",
        "cta": "Get My Free Second Opinion",
        "thankYou": {
          "title": "We've Got Your Info!",
          "message": "A Synergy Home specialist will reach out shortly. Remember - if your system can be fixed, we'll fix it first."
        }
      }
    ]
  }$json$::jsonb
)
on conflict (slug) do update set
  config = excluded.config,
  name = excluded.name,
  service = excluded.service,
  updated_at = now();
