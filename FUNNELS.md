# Funnels — Architecture & Playbook

> **TL;DR for fresh agents:** This codebase has TWO funnel rendering paths. New funnels use **code-based** components (React files in `components/funnels/`). Legacy funnels use **config-driven** rendering (JSON in `client_funnel_steps`). Default to code-based for any new work — the config-driven editor is being phased out. The Funnels dashboard, tracking pipeline, and lead capture work identically for both.

---

## The Two Patterns

### Pattern A — Code-based funnels (use this for new work)

Each funnel is a bespoke React component file. The database row is just metadata (slug, name, tracking, branding, visitor counter). The page content lives in code.

- **Source of truth:** `components/funnels/{funnel-name}/`
- **Routing:** `lib/funnel-loader.js` has a `CODE_FUNNELS` registry. If `funnel.slug` matches a key, the registered component renders. Otherwise falls through to Pattern B.
- **Currently live:** `generator-quote` (Synergy Home ch014) — see `components/funnels/synergy-generator/`
- **Iterate by:** editing the React file, pushing to `main`, Vercel auto-deploys in ~60s. Ad URL never changes.

### Pattern B — Config-driven funnels (legacy, do not extend)

The funnel UI editor writes step content into `client_funnel_steps.config` JSONB. `FunnelSurvey.js` reads the config and renders generic step types (cards, list, text, contact).

- **Source of truth:** Supabase tables + the funnel editor UI at `/control/{clientId}/funnels/{id}`
- **Currently live:** `hvac-quote` (Synergy Home ch014)
- **Status:** kept for backward compatibility. Don't add features. New funnels should be Pattern A.

---

## Routing Flow

```
synergyhome.co/                          (custom domain root)
  → middleware reads Host header
  → /dev/* paths bypass everything (early return)
  → looks up client_funnels.custom_domain
  → rewrites to /f/{slug}
  → app/f/[slug]/page.js → loadFunnel() → renderStep()
  → renderStep checks CODE_FUNNELS registry first

If slug is in CODE_FUNNELS:
  → renders the registered component (e.g. SynergyGenerator)
Otherwise:
  → renders FunnelSurvey/FunnelThankYou with the DB step config

synergyhome.co/f/generator-quote/thanks
  → app/f/[slug]/[stepSlug]/page.js → renderStep() with step_type='thank_you'
  → CODE_FUNNELS registry returns SynergyGeneratorThankYou
```

---

## Key Files

| File | Purpose |
|---|---|
| `middleware.js` | Host routing + auth guard. `/dev/*` bypasses everything. |
| `lib/funnel-loader.js` | Loads funnel + steps. Contains `CODE_FUNNELS` registry. |
| `app/f/[slug]/page.js` | Entry step renderer (delegates to `renderStep`) |
| `app/f/[slug]/[stepSlug]/page.js` | Subsequent step renderer |
| `components/funnels/{name}/` | Code-based funnel components — one folder per funnel |
| `components/FunnelSurvey.js` | Legacy generic survey renderer (Pattern B) |
| `components/FunnelThankYou.js` | Legacy generic thank-you renderer (Pattern B) |
| `app/dev/page.js` | Index of all dev mockups at `/dev` |
| `app/dev/{name}/page.js` | Dev preview wrappers (thin — import from `components/funnels/`) |

---

## How to ITERATE on an existing code-based funnel

The most common task. To change copy, layout, options, design — anything visual or behavioral on the live funnel:

1. **Find the component:** `components/funnels/{funnel-slug}/` (folder name usually matches the slug)
2. **Edit the React file directly.** All copy, options, animations, CSS live here.
3. **Preview locally:**
   - Start dev server in this worktree: `cd <worktree> && npm run dev -- -p 3002`
   - Visit `http://localhost:3002/dev/{dev-slug}` — it renders the same component with `disableTracking={true}` so dev hits don't pollute production analytics
4. **Push to `main`** — Vercel auto-deploys in ~60s. The ad URL `synergyhome.co/f/{slug}` immediately serves the new version.

**No DB changes needed.** No editor clicks. No funnel record touch.

### Why dev preview matches production

Each dev preview page (e.g. `app/dev/funnel-preview/page.js`) is a 4-line wrapper that imports the production component with `disableTracking`. Editing the component updates both. **Don't duplicate code into the dev folder.**

---

## How to CREATE a new code-based funnel from scratch

### Step 1 — Build the component

Create a folder under `components/funnels/{your-funnel-slug}/`:

```
components/funnels/synergy-generator/
├── design.js                      ← shared CSS template literal
├── SynergyGenerator.js            ← main survey component
└── SynergyGeneratorThankYou.js    ← thank-you component
```

The component MUST accept these props (passed by `funnel-loader.js`):

```js
export default function YourFunnel({
  funnelId,         // UUID — used for tracking events
  funnelSlug,       // e.g. 'generator-quote' — used for thank-you redirect
  clientId,         // e.g. 'ch014'
  branding = {},    // { logoUrl, thankYouUrl, primaryColor, ... }
  tracking = {},    // { gtagId, headCode }
  stepConfig = {},  // unused for code-based, present for parity
  disableTracking = false,  // true when rendered at /dev/* preview URLs
})
```

Copy the tracking pattern from `components/funnels/synergy-generator/SynergyGenerator.js`:

- **On mount:** fire one `page_view` per session to `/api/funnel-events`
- **On each answer:** call `saveField(field, value)` which POSTs to `/api/funnel-leads` (creates lead on first call, updates on subsequent)
- **On final submit:** save remaining fields, mark lead `status: 'new_lead'`, redirect to thank-you
- **Always check `disableTracking` and `funnelId` before any fetch** — dev previews skip all of it

Thank-you component should:
- Fire one `thank_you_view` event on mount
- Render `stepConfig.conversionPixel` as raw HTML (this is where Google Ads conversion fires)

### Step 2 — Register in the loader

In `lib/funnel-loader.js`, add to the `CODE_FUNNELS` object:

```js
import YourFunnel from '../components/funnels/your-funnel-slug/YourFunnel'
import YourFunnelThankYou from '../components/funnels/your-funnel-slug/YourFunnelThankYou'

const CODE_FUNNELS = {
  'generator-quote': { survey: SynergyGenerator, thankYou: SynergyGeneratorThankYou },
  'your-funnel-slug': { survey: YourFunnel, thankYou: YourFunnelThankYou },  // ← add this
}
```

The key is the funnel's `slug` column (URL identifier).

### Step 3 — Add a dev preview wrapper

Create `app/dev/{your-funnel-slug}/page.js`:

```js
import YourFunnel from '../../../components/funnels/your-funnel-slug/YourFunnel'
export default function Page() { return <YourFunnel disableTracking /> }
```

And `app/dev/{your-funnel-slug}/thank-you/page.js`:

```js
import YourFunnelThankYou from '../../../../components/funnels/your-funnel-slug/YourFunnelThankYou'
export default function Page() { return <YourFunnelThankYou disableTracking /> }
```

Then add an entry to the `MOCKUPS` array in `app/dev/page.js` so the new mockup shows up at `/dev`.

### Step 4 — Create the database record

Insert one row into `client_funnels`:

| Column | Value |
|---|---|
| `slug` | `your-funnel-slug` (must match the loader registry key) |
| `client_id` | the client's ID, e.g. `ch014` |
| `custom_domain` | e.g. `clientdomain.com` (or null for app-domain only) |
| `name` | display name for the dashboard |
| `status` | `live` |
| `branding` | `{ "logoUrl": "...", "thankYouUrl": null }` |
| `tracking` | `{ "gtagId": null, "headCode": "..." }` |

Insert two rows into `client_funnel_steps`:

| step_order | step_type | slug | config |
|---|---|---|---|
| 1 | `survey` | null | `{}` (config is unused for code-based, but the row must exist for routing) |
| 2 | `thank_you` | `thanks` | `{ "conversionPixel": "<script>...</script>" }` |

The step records are minimal placeholders — they exist so the loader knows which `step_type` to render. All actual content lives in code.

### Step 5 — Wire Google Ads tracking via the funnel editor

Go to `/control/{clientId}/funnels/{funnelId}`:

- **Settings → Head tracking code:** paste the gtag.js loader + `gtag('config', 'AW-XXXXXXXXXX')` snippet
- **Steps → Thank You → Edit → Conversion pixel:** paste the `gtag('event', 'conversion', { send_to: 'AW-XXX/YYY' })` snippet

Both are admin-paste fields. No code changes for tracking pixel updates.

---

## Tracking — how page_view, leads, and conversions flow

| Event | Where it fires | Where it lands |
|---|---|---|
| `page_view` | Code-based: `useEffect` on mount<br>Config-based: `FunnelSurvey` on mount | `funnel_events` table + bumps `client_funnels.visitors` (only once per session via sessionStorage) |
| Lead create/update | Each survey answer → `/api/funnel-leads` | `funnel_leads` table |
| Lead status `new_lead` | Final submit | Updates lead row → shows on Leads tab |
| `thank_you_view` | Thank-you mount | `funnel_events` table |
| Google Ads conversion | Thank-you renders `stepConfig.conversionPixel` HTML | Fires `gtag('event', 'conversion', ...)` browser-side |

The Funnels dashboard math (visitors / leads / conv rate) reads directly from `client_funnels.visitors` (count) and `funnel_leads` rows with `status = 'new_lead'`. No analytics changes needed when adding a new funnel — just point traffic at it.

---

## A/B Testing — Path A (recommended)

Run two funnel records with different slugs, both rendering different React components, split traffic at the **Google Ads campaign level** (not server-side).

```
generator-quote      → SynergyGenerator       (50% of ad spend)
generator-quote-v2   → SynergyGeneratorV2     (50% of ad spend)
```

Each appears as its own row on the Funnels dashboard with its own visitor + lead counts. Compare conv rates side-by-side.

To set up:
1. Build a second component (e.g. `components/funnels/synergy-generator-v2/`) — usually start by duplicating the existing one and changing the variable
2. Register it in `CODE_FUNNELS` with a different slug
3. Insert a second `client_funnels` row with that slug
4. Update one of your Google Ads campaigns to point at the v2 URL

No cookies, no random branching, no schema changes. The split happens at the ad platform.

---

## Static HTML Pages (legacy, being phased out)

Some pages live as static HTML in `public/` (e.g. `public/services/generators/index.html`). The middleware bypasses funnel routing for paths in the `STATIC_PATHS` array.

**Don't add new ones.** Build new landing pages as code-based funnels instead — same iteration speed, plus you get tracking and a Funnels dashboard row for free.

---

## Database Tables

### `client_funnels`
| Column | Purpose |
|---|---|
| `slug` | URL identifier (must match `CODE_FUNNELS` key for code-based funnels) |
| `client_id` | FK to client |
| `custom_domain` | e.g. `synergyhome.co` |
| `status` | `live` or `draft` |
| `branding` | jsonb `{ logoUrl, primaryColor, thankYouUrl }` |
| `tracking` | jsonb `{ gtagId, headCode }` — `headCode` injected into `<head>` on every page |
| `visitors` | integer counter, bumped by `/api/funnel-events` page_view |

### `client_funnel_steps`
For code-based funnels: minimal placeholder rows. The `step_type` matters (survey vs thank_you), the `config` is mostly unused except for `conversionPixel` on the thank-you step.

For config-based funnels (legacy `hvac-quote`): full step content in `config` JSONB.

### `funnel_events`
Append-only event log. `event_type` ∈ `page_view`, `thank_you_view`. Used for analytics.

### `funnel_leads`
One row per survey submission. Fields filled progressively as user advances. `status: 'new_lead'` when contact form submitted.

---

## Assets — Supabase Storage

All funnel images in the `funnel-assets` public bucket (project `mbodzggsefkpesqcxskv`):

```
funnel-assets/
├── templates/{template-name}/    ← shared images (e.g. icons for HVAC options)
└── clients/{client_id}/           ← client-specific (logo, testimonial photos)
```

Public URL: `https://mbodzggsefkpesqcxskv.supabase.co/storage/v1/object/public/funnel-assets/{path}`

For code-based funnels, just hardcode the URL into the component. For config-based, store URL in `step.config.options[].img`.

---

## Dev Workflow Gotchas

### Worktrees need `.env.local`
Git worktrees don't inherit env files. If running a dev server in a worktree, copy from the main project:
```bash
cp /path/to/main/repo/.env.local /path/to/worktree/.env.local
```

### Dev server port conflicts
The default port 3000 may be in use by the main project's server. Use a different port:
```bash
npm run dev -- -p 3002
```

### Viewing from phone (same WiFi)
Bind to all interfaces:
```bash
npm run dev -- -p 3002 -H 0.0.0.0
```
Then visit `http://{your-mac-IP}:3002/dev/{slug}` from the phone. The middleware's `/dev/*` early-return makes mockups reachable from any host.

### Middleware `/dev/*` bypass
`middleware.js` has an early return for any path starting with `/dev/` — these bypass auth, custom-domain rewriting, everything. Don't remove this. It's how mockups stay reachable from arbitrary hosts during development.

---

## Current Funnels

| Client | Domain | Slug | Pattern | Component |
|---|---|---|---|---|
| Synergy Home (ch014) | synergyhome.co | `hvac-quote` | Config-driven (B) | `FunnelSurvey` (generic) |
| Synergy Home (ch014) | synergyhome.co | `generator-quote` | Code-based (A) | `components/funnels/synergy-generator/` |

---

## Roadmap (parked)

These are the next architecture changes once the current launches stabilize:

1. **Migrate `hvac-quote` to code-based** — port the existing FunnelSurvey config to `components/funnels/synergy-hvac/`. Once both funnels are code-based, deprecate `client_funnel_steps.config` editing in the UI.
2. **Strip down the funnel editor** — remove the step drawer (headline + questions form). Keep only: Name | Tracking pixels | Branding | Status.
3. **Drop `client_funnel_steps` eventually** — once all funnels are code-based, the table becomes vestigial. Replace with a single `component` column on `client_funnels`.

These are intentionally deferred. Path forward is incremental, not a big-bang rewrite.
