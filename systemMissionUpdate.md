# Mission App — Session Handoff (2026-07-23)

Handoff for whoever picks up next. This captures where the "mission" app stands,
what just shipped, the deploy/commit flow, and the next task (onboarding a new
Meta ad-account client, Contour Scottsdale).

---

## Repo / deploy flow (IMPORTANT — follow exactly)

- Working branch: **`feature/mission-terminal`**. Main is **`main`**; Vercel
  auto-deploys `main` on push.
- After a change lints clean, commit on the feature branch, then merge into
  `origin/main` via a **detached temp worktree** and push:
  ```
  git worktree add --detach <scratch> origin/main
  git -C <scratch> merge feature/mission-terminal --no-edit
  git -C <scratch> push origin HEAD:main
  git worktree remove <scratch>
  ```
  (Occasionally a conflict appears on `main` from parallel edits — resolve with
  `git -C <scratch> checkout --theirs <file>` since the feature branch is the
  source of truth, then commit + push.)
- Lint every touched file with `npx eslint <file>` before committing.
- **Verify deploys** with `vercel ls` (● Ready). CLI is authed + linked.
- Direct prod DB access: `psql "$SUPABASE_DB_URL"` (from `.env.local`). RLS does
  not apply to that connection — flag destructive statements first.
- Live schema snapshot committed at `db/schema.md`; regenerate with
  `npm run db:schema`.

## The app

- Mission app = the new "Business IDE" version of the client dashboard. Route:
  `app/control/[clientId]/mission/page.js` (one big file — page + all views +
  CSS in a template string near the bottom, class root `.ide`).
- Classic dashboard = `components/EcomControlCenter.js`, rendered under
  `app/control/[clientId]/dashboard`.
- Client-scoped nav/layout: `app/control/[clientId]/layout.js`.

## Just shipped this session (most recent first)

- **Mission is now the DEFAULT** (agency + client). Classic is opt-in.
  - `layout.js`: landing on `/dashboard` redirects to `/mission` unless
    `localStorage.prefer_classic_<clientId> === '1'`.
  - Mission titlebar "← classic" sets that opt-out; classic dashboard shows
    "✨ Back to new version" which clears it.
  - `app/login/page.js`: clients route straight to `/mission` (classic only if
    opted out); agency admins already land on `/control/mission`.
- **PnL sticky header** (`.ov-top` position:sticky) — Shield Score + Last-updated
  + zoom/date controls pin on scroll; vertically centered.
- **Custom date range** zoom (4th button next to Daily/Weekly/Quarterly): an
  Airbnb-style 2-month `RangeCalendar` — click start (fills brand color), hover
  extends the span (lighter brand between), click end to commit. Aggregates all
  business days in the range into one P&L period via `buildPeriods(list, 'custom',
  {start,end})`. Widens the loaded window via `onEnsureRange` if the start
  predates it. NOTE: brand-color CSS must use `rgb(var(--blue-500) / .22)` — the
  `--blue-*` vars are space-separated channels set on `:root` by layout.js.
- **Shield Score** (top-left card): 0–100 composite from dialed KPIs — True ROAS
  35%, CAC 25%, AOV 20%, Net margin 20%; each scored off its own red/green dial
  (40 at red, 85 at green); weights re-normalize when a KPI is missing.
- **Cursor-style re-skin**: warm graphite palette (`--bg:#202023 --panel:#1a1a1c
  --panel2:#2a2a2e`), seamless active tab, neutral resize handles.
- **Schema browser**: default = list view; column pills replaced by a "Columns"
  checkbox dropdown; relationship shortcut buttons removed; `client_id` pinned
  leftmost and only visible to `agency_admin_security` AND not in view-as; verify
  deep-link filters scoped to their own table (fixed cross-table `sku` errors).
- **Sortable drill tables** (click header → asc/desc/off; TOTALS pinned).
- **Agency-controlled client-visible mission tabs**: Settings → "Client-visible
  tabs" toggles (stored in `client.settings.mission_hidden_tabs`); PnL/Schema/
  Settings always visible; Manual/Ledger/Policies/Memory default hidden from
  clients. Sidebar filters under a client role OR view-as.
- **Dashboard Gross Revenue fix**: classic dashboard "Gross Revenue" now =
  `subtotal + discounts` (true merchandise gross), matching mission P&L. Was
  showing `sale_amount` (post-discount total incl. tax/shipping).
- **Daily P&L digest**: one editable `{{token}}` template in Settings drives
  Slack + SMS; sections Revenue / Orders / Paid Ads (Blended/Meta/Google) /
  Organic / Margin. Lede: "Yesterday: $X net on $Y gross. <platform note>".
  `lib/mission/pnl-digest.js` (digestModel → renderDigest for both channels).
- **Chorus (white-labeled as "your AI assistant") MCP** at
  `app/api/mcp/[transport]/route.js`: read-only tools get_instructions,
  get_daily_pnl (defaults to TODAY, live-syncs), get_daily_digest,
  get_pnl_range, list_tables, query_table. Playbook served from
  `docs/chorus.md`. Chorus connects via OAuth (`app/api/oauth/*`).

## Known caveats / open items

- `docs/chorus.md` playbook + `get_instructions` tool are live; the Chorus-side
  AGENTS.md / IDENTITY.md and the daily SMS automation are configured in Chorus's
  own UI (not this repo).
- Meta **write** (campaign push) still blocked on `ads_management` Advanced
  Access via App Review. See `MEMORY.md` → meta-campaign-push.
- User feedback: keep responses short (TLDR); auto-push after each change without
  asking; ask before writing production code.

## NEXT TASK — onboard a new Meta ad-account client (Contour Scottsdale)

Goal: pull Contour Scottsdale's **Meta** ad data into a new client account.
User's BM already has **ad account access** to Contour Scottsdale.

How Meta connection works in this repo:
- Per-client row in **`meta_connections`** table: `client_id, ad_account_id,
  access_token, app_secret`. Helpers in `lib/meta.js`
  (`getMetaConnection`, `fetchMetaCampaignInsights`, `metaInsightToRow`).
- Onboarding API: **`app/api/meta-connection/route.js`** (agency-admin only) —
  validates the ad_account_id + token pair live against Meta, then saves.
- UI: **`components/MetaConnectionModal.js`**, opened from the client's Paid Ads
  page ("Connect Meta →").
- Sync job: `app/api/sync-meta-ads/route.js` (cron + dashboard refresh) writes
  `client_meta_campaigns`.

Steps for the user (mostly manual/Meta-side, not code):
1. Create the client account for Contour Scottsdale in the app (needs a client_id).
2. Generate a **System User token** in the user's Business Manager, with Contour's
   ad account assigned and `ads_read` scope (long-lived). A personal user token
   works but expires ~60 days.
3. Get Contour's ad account ID (`act_…`).
4. On that client's Paid Ads tab → Connect Meta → paste ad account ID + token →
   Test → Save. Sync then pulls data.
5. Reading = `ads_read` only (light). Writing campaigns = separate
   `ads_management` + App Review path (still blocked).

### Progress on the Contour/Meta onboarding task (this session, continued)

- **Fixed dead "Connect Meta" button** (`app/control/[clientId]/paid-ads/page.js`):
  it had no onClick, so non-ecom clients (med spa etc.) couldn't connect Meta at
  all. Now opens `MetaConnectionModal` (imported + `metaModalOpen` state + mounted
  at the end of the component, passing `appliedStart`/`appliedEnd`).
- **Added token how-to** in `components/MetaConnectionModal.js`: a collapsible
  "How do I get a System User token?" guide (share ad account → create system
  user → assign asset with Manage campaigns → generate token with ads_read).

- **Meta connection now reachable from the default (mission) experience**:
  added a "Meta Ads connection" card to **mission Settings** (agency-only) that
  opens `MetaConnectionModal`. Also still available from classic paid-ads (now
  wired). `MetaConnectionModal` imported into `mission/page.js`; SettingsView
  computes a last-30-day start/end for the modal's optional Sync-now.

### Client creation flow (confirmed)

- **POST `/api/clients`** with `{ client_name, account_type: 'ecom' | (else
  home_service), industry, city, state }` → auto-generates `chNNN` id, inserts
  into `client` table (`is_ecom = account_type==='ecom'`). UI in
  `app/control/clients/page.js` (also links Google Ads customer_id per client via
  `client_google_ads_account`).
- So creating Contour = a **home_service** (non-ecom) client.

### ⚠️ DECISION POINT — mission default vs lead-gen clients

- The mission **PnL is ECOM-oriented** (built on `client_orders`: gross/net,
  COGS/BOM, AOV, orders). Contour Scottsdale is a **med spa = lead-gen**
  (`home_service`, uses `client_lead`, not orders). With mission now the default,
  a lead-gen client would land on a PnL that doesn't fit (little/no order data).
- **Options for the user to decide:**
  1. Build a **lead-gen variant** of the mission overview (cost-per-lead, leads,
     appointment rate, spend, CAC per lead) shown when `!is_ecom`.
  2. Or **default non-ecom clients to classic** (paid-ads/leads views) while ecom
     clients get mission — i.e. gate the mission-default redirect on `is_ecom`.
  3. Or keep mission default for everyone and accept the PnL is ecom-only for now
     (Meta spend still flows into `client_meta_campaigns` and shows in paid-ads).
- Meta *data pull* itself is client-type-agnostic — it lands in
  `client_meta_campaigns` and shows in the Paid Ads view regardless. So Contour
  onboarding (connect → sync → see spend) works today via mission Settings →
  Connect Meta, independent of the PnL-fit question.

### Mission client/agency switcher (confirmed + fixed)

- The mission titlebar top-left dropdown (`app/control/[clientId]/layout.js`,
  ~line 437+): **switching to another client** already links to
  `/control/<id>/mission` (stays in mission ✓). **"Agency"** previously linked
  to `/control` (classic agency dashboard) — **fixed** to `/control/mission` (the
  agency-level mission view). So the whole switcher now stays in mission
  structure.
- Agency-level mission view = `app/control/mission/page.js` (login already sends
  agency admins there).

### Other noted gaps (out of scope for Contour)

- TikTok "Connect TikTok →" button on paid-ads is also dead (no handler).
