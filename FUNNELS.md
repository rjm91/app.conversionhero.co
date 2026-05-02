# Funnels — Architecture & Playbook

## Overview

Funnels are multi-step survey/landing pages served on client custom domains (e.g. `synergyhome.co`). A visitor lands on the root domain, the Next.js middleware looks up the funnel by domain, and rewrites the request to the internal `/f/{slug}` route. No client ever sees a conversionhero.co URL.

---

## Routing Flow

```
synergyhome.co/             (custom domain, root)
  → middleware reads Host header
  → looks up client_funnels.custom_domain = 'synergyhome.co'
  → rewrites to /f/hvac-quote  (internal Next.js route)
  → app/f/[slug]/page.js loads funnel + steps from Supabase
  → renders FunnelSurvey component

synergyhome.co/f/hvac-quote/thanks
  → middleware sees /f/* prefix → passes through unchanged
  → app/f/[slug]/[stepSlug]/page.js renders FunnelThankYou

synergyhome.co/services/generators/   (static HTML — see below)
  → middleware sees /services/ prefix → passes through
  → Vercel serves public/services/generators/index.html
```

---

## Database Tables

### `client_funnels`
Top-level funnel record — one per client offer.

| Column | Purpose |
|---|---|
| `slug` | URL identifier, e.g. `hvac-quote` |
| `client_id` | Links to `client` table |
| `custom_domain` | e.g. `synergyhome.co` — used by middleware for host-based routing |
| `status` | `live` or `draft` — only `live` funnels are served |
| `branding` | jsonb: `{ logoUrl, primaryColor, primaryColorHover, primaryColorLight, thankYouUrl }` |
| `tracking` | jsonb: `{ gtagId, headCode }` — headCode injected into every funnel page `<head>` |
| `service` | `hvac` / `generator` / `solar` etc. |
| `config` | Legacy seed blob — **not read at runtime**, only used for initial migration |

### `client_funnel_steps`
One row per page within a funnel (survey, thank-you, landing, etc.).

| Column | Purpose |
|---|---|
| `funnel_id` | FK to `client_funnels` |
| `step_order` | 1 = entry page, 2 = thank-you, etc. |
| `step_type` | `survey` / `thank_you` / `landing` / `booking` / `custom` |
| `slug` | null for step 1 (entry); otherwise appended to funnel URL |
| `config` | jsonb — all step content lives here (headline, steps[], options[], etc.) |

**Survey step config shape:**
```json
{
  "headline": { "eyebrow": "...", "title": "..." },
  "footer":   { "companyName": "...", "privacyUrl": "...", "termsUrl": "..." },
  "steps": [
    {
      "id": "intent",
      "question": "Would you Like To Fix or Replace Your HVAC System?",
      "type": "cards",
      "cols": 2,
      "autoNext": true,
      "options": [
        { "label": "Fix System (If Possible)", "value": "Fix (if possible)", "img": "https://..." },
        { "label": "Replace System", "value": "Replace", "img": "https://..." }
      ]
    }
  ]
}
```

Step types: `cards` (image grid), `list` (icon list), `text` (single input), `contact` (name/phone/email form).

---

## Assets — Supabase Storage

All funnel images are hosted in the `funnel-assets` public bucket in Supabase project `mbodzggsefkpesqcxskv`.

```
funnel-assets/  (public bucket)
├── templates/
│   └── hvac-quote/
│       ├── fix-system.png
│       ├── replace-system.png
│       ├── heat-pump.png
│       ├── furnace-and-ac.png
│       ├── mini-split.png
│       └── space-heater-window-unit.png
└── clients/
    └── ch014/
        └── synergy-logo.svg
```

Public URL pattern:
```
https://mbodzggsefkpesqcxskv.supabase.co/storage/v1/object/public/funnel-assets/{path}
```

When adding a new template (e.g. `solar-quote`), create `templates/solar-quote/` in the bucket. When adding a new client logo, upload to `clients/{client_id}/logo.svg`.

---

## Code — Key Files

| File | Purpose |
|---|---|
| `middleware.js` | Host-based routing + auth guard |
| `lib/funnel-loader.js` | Loads funnel + steps from Supabase (no-store fetch — cache-safe) |
| `app/f/[slug]/page.js` | Entry step renderer |
| `app/f/[slug]/[stepSlug]/page.js` | Subsequent step renderer |
| `components/FunnelSurvey.js` | Renders survey steps (cards, list, text, contact) |
| `components/FunnelThankYou.js` | Renders thank-you page |

---

## Tracking

- **Global head code** (`client_funnels.tracking.headCode`) — injected on every page of the funnel. Used for gtag.js, Meta Pixel base code, etc.
- **Conversion pixel** (`client_funnel_steps.config.conversionPixel`) — injected only on the thank-you step. Used for Google Ads conversion events, Meta Purchase events, etc.

Both are injected via `dangerouslySetInnerHTML` + `suppressHydrationWarning`. Survey "Continue" uses `window.location.href` (full reload) so injected scripts execute on the thank-you page.

---

## SQL Migrations

Run in order in Supabase SQL Editor:

| File | What it does |
|---|---|
| `sql/2026-04-20_funnels.sql` | Creates `client_funnels`, `funnel_events`; seeds Synergy HVAC funnel |
| `sql/2026-04-21_funnel_steps.sql` | Creates `client_funnel_steps`; backfills step rows from existing config |
| `sql/2026-04-22_client_domains.sql` | Creates `client_domains` table |
| `sql/2026-04-23_rehost_funnel_assets_v2.sql` | Migrated all image URLs from synergyhome.co to Supabase Storage |

---

## Static HTML Pages (Temporary — Synergy Launch)

While the in-app funnel builder is being developed, quick landing pages for Synergy Home ads are built as plain HTML/CSS/JS files served from `public/`. These live alongside the funnel system with no interference.

**How it works:**
- Files in `public/` are served as static assets by Vercel
- `middleware.js` has a `STATIC_PATHS` array that bypasses funnel routing for these paths
- Currently whitelisted: `/services/`, `/testimonials/`, `/about/`, `/contact/`
- To add a new section, add its prefix to `STATIC_PATHS` in `middleware.js`

**Folder structure:**
```
public/
└── services/
    └── generators/
        └── index.html    → synergyhome.co/services/generators/
```

**To clone for a new page:**
1. Copy `public/services/generators/index.html` to the new path
2. Update title, headline, body copy, phone number
3. Add the path prefix to `STATIC_PATHS` in `middleware.js` if it's a new top-level section
4. Commit + push → live in ~1 min

**These are temporary.** Once the funnel builder supports custom page types (landing, testimonial, booking), these will be migrated into `client_funnel_steps` rows and the `public/` pages retired.

---

## Current Funnels

| Client | Domain | Slug | Status |
|---|---|---|---|
| Synergy Home (ch014) | synergyhome.co | hvac-quote | live |
| Synergy Home (ch014) | synergyhome.co/f/generator-quote | generator-quote | live |

---

## Adding a New Funnel (Checklist)

1. Upload template images to `funnel-assets/templates/{new-slug}/` in Supabase Storage
2. Upload client logo to `funnel-assets/clients/{client_id}/` if new client
3. Insert row into `client_funnels` with slug, client_id, custom_domain, branding, tracking
4. Insert step rows into `client_funnel_steps` (step_order 1 = survey, 2 = thank-you)
5. Add custom domain to Vercel project domains (Settings → Domains)
6. Verify DNS propagation, then test the live URL
