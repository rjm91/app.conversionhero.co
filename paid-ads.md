# Paid Ads — Architecture & Roadmap

## Overview

The **Paid Ads** tab (`/control/[clientId]/paid-ads`) is ConversionHero's multi-platform ad dashboard. It's a **third-party attribution tool**: it pulls spend/performance from each ad platform and reconciles it against **CH-attributed conversions** (Shopify orders matched back to campaigns via UTM/click data). The attribution numbers live in the green **Conv (CH)** / **Cost/Conv (CH)** columns and are the platform-independent source of truth.

Platforms are shown as stacked **accordion sections**. Each section's header row carries the platform icon, name, campaign count, and the platform totals all in one row; clicking it collapses the campaign rows while keeping the column names + totals visible (spreadsheet-style summary).

> Route history: this tab was previously `/youtube-ads`, renamed to `/paid-ads` (a permanent redirect from the old path lives in `next.config.js`).

---

## Platform Status

| Platform | Status | Notes |
|---|---|---|
| **Google Ads** | ✅ Live | Connected via OAuth (manager/MCC account). Real data. |
| **Meta (Facebook)** | ⏳ Placeholder | Dashed "Connect →" card only. No data yet. See TODO below. |
| **TikTok** | ⏳ Placeholder | Dashed "Connect →" card only. Lower priority. |

The Meta/TikTok placeholders are intentional — **no fabricated data** is shown on a live client dashboard until the real integration lands.

---

## Google Ads Architecture (the pattern to mirror)

One Google **manager (MCC) account** is connected once via OAuth; a single refresh token is stored, and each client is a **customer ID** under that manager.

| File | Purpose |
|---|---|
| `lib/google-ads.js` | Token mgmt (refresh token in `google_ads_tokens`, single row), access-token exchange, OAuth URL helpers |
| `app/api/google-ads/auth/route.js` | Initiates OAuth re-auth flow |
| `app/api/google-ads/callback/route.js` | Exchanges code → refresh token, persists it |
| `app/api/google-ads/status/route.js` | Token status |
| `app/api/sync-youtube-ads/route.js` | Pulls campaigns/ad groups/ads per `customer_id`, stores in `client_google_campaigns` (keyed by `client_id`). Runs daily via Vercel cron (`vercel.json`). |
| `app/control/[clientId]/paid-ads/page.js` | The UI — accordion, chart, filters, sorting, drill-down, CH attribution columns |

**Env vars:** `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_MANAGER_ID`, `GOOGLE_ADS_REFRESH_TOKEN` (DB token in `google_ads_tokens` takes precedence).

---

## TODO: Meta (Facebook) Ads Integration

The client runs Facebook Ads as well as Google. Mirror the Google architecture.

### Blocker (long pole — start first)
**Meta App Review + Business Verification** for the **`ads_read`** permission with **Advanced Access**. Required to read ad accounts we don't personally admin. Takes a few days.

### Access model (recommended — matches the MCC pattern)
The client shares their ad account with **our Business Manager as a Partner**; we use a long-lived **System User token** that covers all clients. Per-client key needed = their **Ad Account ID** (`act_XXXXXXXXXX`) — the parallel to the Google `customer_id`.

Alternative: OAuth via Facebook Login (user tokens expire ~60 days; needs refresh). Partner/System-User is cleaner for an agency.

### To build (mirroring Google)
- [ ] `lib/meta-ads.js` — token mgmt + Marketing API client
- [ ] `meta_ads_tokens` table — store the System User token
- [ ] Env vars: `META_APP_ID`, `META_APP_SECRET`, `META_SYSTEM_USER_TOKEN`
- [ ] Sync route — `GET /v{ver}/act_<id>/insights?level=campaign&fields=spend,clicks,cpc,actions,...`
- [ ] `client_meta_campaigns` table — keyed by `client_id`
- [ ] Read it into the **Meta accordion section** in `paid-ads/page.js` (replace the placeholder card)
- [ ] Wire the **Conv (CH)** columns — same Shopify UTM/click → campaign ID join as Google

### Needed from Ryan once App Review clears
App ID, App Secret, System User token, and the client's `act_` ad account ID.

### Attribution context (the Shopify side)
Conversions are matched by injecting the platform's campaign ID into the URL (Google: tracking template `{campaignid}`; Meta: equivalent URL param), which Shopify captures in the order's UTM/customer-journey data. Pull via Shopify Admin GraphQL API (`customerJourneySummary.lastVisit.utmParameters.campaign`) and join `utmParameters.campaign` → the platform campaign ID.

---

## Shopify Order Sync — ✅ LIVE (2026-06-09)

**Working end-to-end for ShieldTech (ch069).** First sync pulled 1,073 orders → `client_lead`. Connection: custom app **CH - ShieldTech 2** (created in the *client's* own dev dashboard org — Client ID `127d465c5b67f8e8a38ea6f45764d634`), token captured via our OAuth callback into `shopify_connections`. Sync route `/api/sync-shopify-orders` (`?client_id=` for one, no param = all). Daily cron at 08:00 in `vercel.json`. Reads order name/email/total/lineItems + `customerJourneySummary.lastVisit.utmParameters` — name/email come from billing/shipping address + order email (NOT the `customer{}` field, which needs `read_customers` we don't have).

### Historical notes (the painful path, kept for reference)

**Goal:** Pull each Shopify order's customer name, email, product, amount, and UTM data, write it into the existing `client_lead` table so customers show on the Leads page AND auto-route to the right campaign via the existing `fetchAttribution()` UTM→campaign match (no new attribution logic). Product → lead Notes (`ch_notes`); amount → `sale_amount`; `utm_campaign` = the Google campaign ID.

### Built & deployed
- `shopify_connections` table (`sql/2026-06-08_shopify_connections.sql`) — stores per-client `{ shop_domain, access_token }`. **Run in Supabase ✅**
- OAuth connect flow: `lib/shopify.js`, `app/api/shopify/auth`, `app/api/shopify/callback` (commit d337dc8). Verifies HMAC, exchanges code, upserts token.

### Two Shopify apps (Partner org "ConversionHero", partners.shopify.com)
- **Public app** (Client ID `d3fee78b04750a82a9ad7aba82aac010…`) — public distribution. **Blocked: live-store install requires App Store review** (not submitted; for unlisted agency use this path is heavy). Parked as the future multi-client OAuth path.
- **CH - ShieldTech app** (Client ID `5482b9b88550933e34f471dbd02366cd`) — **Custom distribution** locked to `ek14hy-03.myshopify.com`. This is the one for client #1 (ShieldTech = client `ch069`).

### BLOCKER (2026-06-08): need real store-owner admin access
Ryan does not have true owner-level admin on the ShieldTech store. Installing the custom app + revealing its token both require it. **Plan: finish on a call with an actual store admin.**

Gotchas already hit: legacy in-admin "Develop apps" is retired on this store; custom-dist apps can't use our standard OAuth `/authorize` ("installation link invalid"); the custom install link kept redirecting to the app login and eating the token until **"Embed app in Shopify admin" was unchecked** (new version released).

### To finish (with the admin on the call)
1. Open the custom install link while logged into the ShieldTech admin as owner:
   `https://admin.shopify.com/oauth/install_custom_app?client_id=5482b9b88550933e34f471dbd02366cd&no_redirect=true&signature=…` (full signed link saved in chat 2026-06-08).
2. With embedded now off + `no_redirect=true`, it should display the **Admin API access token** (`shpat_…`). Copy it.
3. Insert the connection row in Supabase:
   `insert into shopify_connections (client_id, shop_domain, access_token, scope) values ('ch069', 'ek14hy-03.myshopify.com', '<shpat_…>', 'read_orders,read_customer_events');`
4. Then build the **order sync** (step 3): `/api/sync-shopify-orders` reads the row, pulls orders via Admin GraphQL (`customerJourneySummary.lastVisit.utmParameters` + name/email/total/lineItems), upserts into `client_lead` keyed off the Shopify order ID (dedup), status "Customer", product in `ch_notes`. CH columns then populate automatically.
5. Add a **"Connect Shopify"** button in the UI (step 4).

Note: env vars `SHOPIFY_API_KEY`/`SHOPIFY_API_SECRET` were pointed at the CH-ShieldTech app, but the sync does NOT use them (it reads the token straight from `shopify_connections`), so they don't matter for client #1.
