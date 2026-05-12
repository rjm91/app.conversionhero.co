# Funnels — Architecture & Playbook

## Overview

Funnels are multi-step survey/landing pages served on client custom domains (e.g. `synergyhome.co`). A visitor lands on the root domain, the Next.js middleware looks up the funnel by domain, and rewrites the request to the internal `/f/{slug}` route. No client ever sees a conversionhero.co URL.

Each funnel page is a **bespoke React component** — no config-driven renderer. All page logic, layout, and design lives in code files under `components/funnels/`.

---

## Routing Flow

```
synergyhome.co/             (custom domain, root)
  → middleware reads Host header
  → looks up client_funnels.custom_domain = 'synergyhome.co'
  → rewrites to /f/generator-quote  (internal Next.js route)
  → app/f/[slug]/page.js loads funnel + steps from Supabase
  → lib/funnel-loader.js maps slug → code component
  → renders bespoke React component (e.g. SynergyGenerator.js)

synergyhome.co/f/generator-quote/thanks
  → middleware sees /f/* prefix → passes through unchanged
  → renders SynergyGeneratorThankYou.js
```

---

## Code Architecture — Funnels

### Key Files

| File | Purpose |
|---|---|
| `middleware.js` | Host-based routing + auth guard for /control |
| `lib/funnel-loader.js` | Loads funnel + steps from Supabase; maps slug → component |
| `app/f/[slug]/page.js` | Entry step renderer (reads x-ch-variant header for A/B) |
| `app/f/[slug]/[stepSlug]/page.js` | Subsequent step renderer |

### Funnel Component Folder

```
components/funnels/
  synergy-generator/
    SynergyGenerator.js         ← survey/landing page (Variant A baseline)
    SynergyGeneratorThankYou.js ← thank-you page
    design.js                   ← design tokens / shared styles
  synergy-hvac/
    SynergyHVAC.js
    SynergyHVACThankYou.js
```

### Funnel Registry (`lib/funnel-loader.js`)

Slugs are mapped to components in the `CODE_FUNNELS` object. Adding a new funnel = add a folder + one entry here.

```js
const CODE_FUNNELS = {
  'generator-quote': {
    survey: SynergyGenerator,
    thankYou: SynergyGeneratorThankYou,
  },
  'hvac-second-opinion': {
    survey: SynergyHVAC,
    thankYou: SynergyHVACThankYou,
  },
}
```

**Rule:** Never use a config-driven renderer. Every funnel page is real code. If there's no registered component for a slug, `funnel-loader` throws an error.

---

## A/B Split Test System

### How It Works

- **Variant assignment:** On first visit, `middleware.js` assigns a `ch_variant` cookie (`a` or `b`) with a 50/50 split. The cookie persists for the session so the visitor always sees the same variant.
- **Variant routing:** `app/f/[slug]/page.js` reads the `x-ch-variant` header (set by middleware from the cookie) and selects the correct step row from `client_funnel_steps`.
- **Tracking:** Each variant has its own `visitors` and `leads` counters on the step row. The control panel shows per-variant stats with conversion rate delta.

### Database Columns (on `client_funnel_steps`)

| Column | Purpose |
|---|---|
| `variant` | `a` or `b` — which variant this step row represents |
| `visitors` | Total visitors routed to this variant |
| `leads` | Total form submissions on this variant |
| `is_active` | `true/false` — inactive variants receive no traffic |

### The Flywheel (Champion/Challenger)

The goal is a continuous improvement loop:

```
1. Run A vs B test
2. Winner emerges (higher conv. rate)
3. Archive loser → toggle is_active = false in DB
4. Build new challenger page in Cursor (new .js file or fork of winner)
5. Register new variant in DB + CODE_FUNNELS registry
6. Now running Winner vs New Challenger
7. Repeat
```

### Control Panel UI (in progress)

Located at: `app/control/[clientId]/funnels/[id]/page.js`

What's built:
- ✅ Per-variant stats table (visitors, leads, conv. rate, delta badge)
- ✅ Traffic toggle per variant (on/off)
- ⬜ Archive loser / declare winner CTA
- ⬜ "Add Challenger" flow — registers a new variant in DB

### Mockup

Work-in-progress mockup lives at: `public/dev-mockups/mockup-ab.html`
Open in browser to see the current UI design. **Always iterate mockup first, get approval, then build.**

---

## Database Tables

### `client_funnels`

| Column | Purpose |
|---|---|
| `slug` | URL identifier, e.g. `generator-quote` |
| `client_id` | Links to `clients` table |
| `custom_domain` | e.g. `synergyhome.co` — used by middleware for host-based routing |
| `status` | `live` or `draft` — only `live` funnels are served |
| `branding` | jsonb: `{ logoUrl, primaryColor, primaryColorHover, primaryColorLight, thankYouUrl }` |
| `tracking` | jsonb: `{ gtagId, headCode }` — headCode injected into every funnel page `<head>` |

### `client_funnel_steps`

| Column | Purpose |
|---|---|
| `funnel_id` | FK to `client_funnels` |
| `step_order` | 1 = entry page, 2 = thank-you, etc. |
| `step_type` | `survey` / `thank_you` |
| `slug` | null for step 1 (entry); otherwise appended to funnel URL |
| `variant` | `a` or `b` for A/B steps; null for non-tested steps |
| `visitors` | Visit counter for this variant |
| `leads` | Lead counter for this variant |
| `is_active` | Whether this variant is receiving traffic |
| `config` | jsonb — passed as `stepConfig` prop to the component |

---

## Assets — Supabase Storage

All funnel images are hosted in the `funnel-assets` public bucket in Supabase project `mbodzggsefkpesqcxskv`.

```
funnel-assets/  (public bucket)
├── templates/
│   └── hvac-quote/
│       ├── fix-system.png
│       └── ...
└── clients/
    └── ch014/
        └── synergy-logo.svg
```

Public URL pattern:
```
https://mbodzggsefkpesqcxskv.supabase.co/storage/v1/object/public/funnel-assets/{path}
```

---

## Tracking

- **Global head code** (`client_funnels.tracking.headCode`) — injected on every page of the funnel via `dangerouslySetInnerHTML`.
- **Conversion pixel** (`client_funnel_steps.config.conversionPixel`) — injected only on the thank-you step.

---

## SQL Migrations

Run in order in Supabase SQL Editor:

| File | What it does |
|---|---|
| `sql/2026-04-20_funnels.sql` | Creates `client_funnels`, `funnel_events`; seeds Synergy HVAC funnel |
| `sql/2026-04-21_funnel_steps.sql` | Creates `client_funnel_steps`; backfills step rows |
| `sql/2026-04-22_client_domains.sql` | Creates `client_domains` table |
| `sql/2026-04-23_rehost_funnel_assets_v2.sql` | Migrated image URLs to Supabase Storage |

---

## Current Funnels

| Client | Domain | Slug | Status |
|---|---|---|---|
| Synergy Home (ch014) | synergyhome.co | generator-quote | live |
| Synergy Home (ch014) | synergyhome.co | hvac-second-opinion | live |

---

## Adding a New Funnel (Checklist)

1. Create component folder: `components/funnels/{slug}/`
2. Build `{Name}.js` (survey) and `{Name}ThankYou.js` components
3. Register in `lib/funnel-loader.js` `CODE_FUNNELS` object
4. Upload assets to `funnel-assets/clients/{client_id}/` in Supabase Storage
5. Insert row into `client_funnels` (slug, client_id, custom_domain, branding, tracking)
6. Insert step rows into `client_funnel_steps` (step_order 1 = survey, 2 = thank-you)
7. Add custom domain to Vercel project (Settings → Domains)
8. Verify DNS propagation, test live URL

## Adding a New A/B Variant (Checklist)

1. Build the new variant component in Cursor (fork winner or write fresh)
2. Register new slug/variant in `lib/funnel-loader.js` if it's a new component
3. Insert a new `client_funnel_steps` row with `variant = 'b'`, `is_active = true`
4. Set old loser row to `is_active = false` via control panel or SQL
5. Verify traffic split in control panel
