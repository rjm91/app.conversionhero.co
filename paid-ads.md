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
| `app/api/sync-youtube-ads/route.js` | Pulls campaigns/ad groups/ads per `customer_id`, stores in `client_yt_campaigns` (keyed by `client_id`). Runs daily via Vercel cron (`vercel.json`). |
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
