# ConversionAgent — Product Overview

## Vision

ConversionAgent is an **AI CMO platform** — an autonomous marketing agent that can plan, budget, launch, optimize, and scale YouTube advertising campaigns on behalf of businesses and their agencies.

Think of it as hiring a world-class Chief Marketing Officer who works 24/7, never misses a data point, and can act — not just advise. Users interact with the agent via **chat or voice**, and the agent handles the full campaign lifecycle end-to-end.

---

## What It Does Today

A multi-tenant **agency client portal** built on Next.js + Supabase, currently serving as the data layer and UI foundation for the AI agent layer coming soon.

### Agency Layer (`agency_admin`)
- Control center with overview of all clients
- Per-client performance dashboards
- Manage client accounts, users, and billing

### Client Layer (`client_admin` / `client_standard`)
- Branded portal — clients only see their own data
- YouTube Ads performance metrics (synced from Google Ads API)
- Video script library with approval workflow
- Contact/lead management
- Team member management with role-based access

### Infrastructure
- **Auth**: Supabase Auth with role-based access control (3 tiers)
- **Database**: Supabase Postgres — clients, profiles, campaigns, scripts, leads, billing
- **Google Ads API**: Live sync of YouTube campaign data
- **Middleware**: Server-side route protection, role-based redirects
- **Deployment**: Vercel (auto-deploy on push to `main`)

---

## Near-Term Roadmap

### 1. Google Ads Write Access
Currently on **Google Ads Developer Access** (read-only sync). Pending approval for **Standard Access**, which unlocks:
- Creating new campaigns programmatically
- Modifying bids, budgets, targeting
- Adding/swapping video creatives in live campaigns
- Full campaign lifecycle management via API

### 2. AI Agent Core
A chat + voice interface where users talk directly to the agent:
- **Plan** — research audiences, recommend campaign structure and budget
- **Launch** — create campaigns, ad groups, and upload creatives automatically
- **Optimize** — analyze performance data, make bid/budget adjustments, pause underperformers
- **Scale** — identify winning creatives and duplicate/expand campaigns
- **Report** — summarize performance in plain language on demand

### 3. HeyGen API Integration
The agent will generate AI UGC (User Generated Content) videos:
- Agent writes video scripts based on offer, audience, and platform best practices
- Scripts sent to HeyGen API to render AI avatar video
- Rendered videos automatically uploaded to Google Ads as new creatives
- Agent can A/B test creatives and iterate based on performance data

### 4. Onboarding Automation (North-Star Milestone)

Today onboarding takes ~2 weeks of manual work per client (folder copying on HostGator, DNS setup, ad campaign build, script writing). The goal is a **5-minute form** that spins up a fully-configured client.

**One-click onboarding produces, in ~5 minutes:**
- New `client` + `profiles` rows
- Funnel row with chosen template merged with client's logo, colors, offer, service area
- Custom domain registered via Vercel Domains API — DNS + SSL auto-provisioned
- Landing page live at `synergyhome.co` (or `go.synergyhome.co`) with tracking pixel embedded
- `calendar_events` seeded with the month's video drops based on chosen plan tier (8 / 13 / 21 / 34 / 55)
- *(Phase 2, post-Standard Access)* First YouTube ad campaign launched against the new landing page — AI writes copy, picks targeting, sets budget
- *(Phase 3, post-Creator plan + Digital Twin)* First month's avatar videos queued for render

This collapses the biggest operational bottleneck in the agency into data entry.

### 5. Full Autonomous Loop
```
Market Research → Script Writing → Video Production (HeyGen) 
→ Campaign Launch (Google Ads) → Performance Monitoring 
→ Optimization → Scaling → Reporting → Repeat
```
All triggered by a single instruction from the user, or run fully autonomously on a schedule.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), Tailwind CSS |
| Backend | Next.js API Routes (serverless) |
| Database | Supabase (Postgres + Auth) |
| Ads API | Google Ads API |
| Video AI | HeyGen API *(coming soon)* |
| AI Agent | *(coming soon)* |
| Deployment | Vercel |

---

## Data Model (Key Tables)

| Table | Purpose |
|---|---|
| `client` | Agency client accounts |
| `profiles` | User accounts linked to auth.users, with roles |
| `client_google_ads_account` | Google Ads account credentials per client |
| `client_yt_campaigns` | Synced YouTube campaign performance data |
| `client_video_scripts` | Scripts written for/by each client |
| `client_lead` | Contact/lead records per client |
| `client_billing` | Billing and payment records |

---

## Role Hierarchy

```
agency_admin
  └── Full access to all clients, all features, user management

client_admin
  └── Full access to their client account, can manage their team

client_standard
  └── Read-only access to their client account, no user management
```

---

## Current Status (April 2026)

- ✅ Multi-tenant portal live at `app-conversionhero-co.vercel.app`
- ✅ Real Supabase Auth with role-based access and middleware protection
- ✅ Google Ads API sync working (YouTube campaign data, read-only)
- ✅ Company page with team member management (create, edit, delete users)
- ✅ Video scripts module
- ✅ Contacts/leads module
- ✅ AI Agent panel (floating chat UI) with tool-calling: `getLeads`, `getPipeline`, `getAdSpend`
- ✅ HeyGen integration — Avatar Studio with avatar/voice pickers, script editor, advanced controls (speed, emotion, aspect ratio, bg color), preview-clip render, generation + status polling, Supabase persistence via `client_avatar_videos`, history view with resume-poll
- ✅ Videos tab restructure: **Videos** (finished, default) | **Scripts** | **Avatar** (AI generation) | **Media**
- ✅ Funnels tab + `client_funnels` table (list view with conversion rate)
- ✅ Funnel detail page with **Steps** + **Settings** tabs
  - Steps: per-step rows showing full live URL (`https://synergyhome.co/f/hvac-quote/...`) with edit drawer
  - Settings: Custom Domain card (dropdown + inline "Register domain") and Head Tracking Code textarea (gtag.js / Meta Pixel — injected on every funnel page)
- ✅ `client_domains` table — per-client domain registry; funnel domain selector pulls from this list
- ✅ Thank-you step has **Conversion Pixel Code** field (Google Ads / Meta event snippet, fires on page load)
- ✅ Custom domain routing: middleware reads `Host` header → looks up `client_funnels.custom_domain` → rewrites to `/f/{slug}` (with pass-through for already-`/f/*` paths)
- ✅ Funnel PATCH API on `nodejs` runtime, uses service-role to bypass RLS for agency edits
- ⏳ Content Calendar (agency-wide + per-client) — mockup approved at `/control/[clientId]/videos/calendar-preview`, building next
- ⏳ `ad_campaigns` table + "Push to Google" flow — deferred until Google Ads Standard Access lands
- ⏳ Google Ads Standard Access (pending Google approval) — unlocks write API
- ⏳ Avatar V (HeyGen Digital Twin) — API-accessible on Creator plan; current HeyGen account on free tier (8 API renders/day limit)
- ⏳ Voice/full-chat AI agent interface (current panel is text-only)
- ⏳ Autonomous campaign management

---

## Recent Decisions Log

- **Videos tab default** = finished videos (not scripts). Scripts moved to sub-tab.
- **Avatar Studio** = white-label HeyGen clone inside the app. Clients never see HeyGen branding.
- **Only Avatar V** will be used in production — stock HeyGen avatars are hidden (pending filter logic once user trains a Digital Twin).
- **Preview button** in Avatar Studio renders a first-sentence test clip so user hears Advanced settings (speed/emotion) applied before full render.
- **Funnels tab** added between Ads and Videos. v1 = read-only list with live conv. stats. In-app funnel builder = future work.
- **Content Calendar sequencing**: build calendar first with unified `calendar_events` table (option A), then build `ad_campaigns` table separately when Standard Access lands. Ad campaigns will write a `calendar_events` row alongside the campaign record so the calendar auto-reflects what AI is doing.
- **Calendar location**: top-level `/control/calendar` (agency-wide, shows all clients color-coded) + per-client `/control/[clientId]/calendar` (filtered). Sidebar item in both layouts.
- **HeyGen plan**: needs upgrade from trial to Creator tier to unlock Avatar V + kill the 8/day limit.
- **Funnel tracking pixel**: build standalone before the funnel builder. Standalone `/pixel.js` + `/api/funnels/track` + `funnel_events` table means existing (non-in-app) landing pages can start collecting data immediately. When the builder ships, it auto-embeds the same pixel — no refactor.
- **Custom domains / white-label hosting for funnels**: agency purchases client domains as part of onboarding (not client-managed DNS). Standardize on **Vercel Domains as the registrar** so buying, DNS, SSL, and routing all happen via one API in one place. Onboarding flow: call Vercel Domains API → domain auto-attaches to project → `funnels.custom_domain` row created → Next.js middleware reads `Host` header and rewrites to internal `/_funnels/{id}` route. Reference implementation: [Vercel Platforms Starter Kit](https://vercel.com/templates/next.js/platforms-starter-kit). Push clients toward subdomains (`go.synergyhome.co`) over apex for DNS reliability.
- **Funnel slug = offer, not client**: slugs like `hvac-quote` (not `synergy-hvac-quote`). Client identity comes from the custom domain (`synergyhome.co`), so the slug stays generic and reusable across clients running the same offer template.
- **Tracking storage = `client_funnels.tracking` jsonb**: global head code stored at `tracking.headCode`, conversion pixels stored at `client_funnel_steps.config.conversionPixel` per step. Both injected via `dangerouslySetInnerHTML` + `suppressHydrationWarning`. Survey "Continue" navigates with `window.location.href` (full reload), so injected `<script>` tags execute properly on the thank-you page.
- **Funnel admin edits bypass RLS**: `/api/funnels/[id]` PATCH route uses service-role client (forced `nodejs` runtime). RLS on `client_funnels` is locked down to public-read of `live` rows only; all writes go through the API.

---

## Productized Service Offer ("Local Video Authority")

Tiers sold to HVAC/home-services clients:

| Plan | Videos/mo | Filming | Price |
|---|---|---|---|
| Pilot | 8 (2/wk) | Synergy Team / DWY | $1,000/mo |
| Starter | 13 (3–4/wk) | Synergy Team / DWY | $1,550/mo · 4-mo min |
| Growth ⭐ | 21 (4–6/wk) | Synergy Team / DWY | $2,450/mo · 4-mo min |
| Pro | 34 (7–9/wk) | Done-For-You | $3,750/mo · 4-mo min |
| Synergy Hero | 55 (2/day) | Done-For-You | Custom |

All tiers include: dedicated creative consultant, scripting, editing, YouTube Ads management ($1,650/mo value). Short-form vertical (≤60s).

The content calendar exists to prove delivery on these per-month video counts.

---

## Name

Working between **ConversionAgent** and **AgentHero** — decision pending.
