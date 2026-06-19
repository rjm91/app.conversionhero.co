# ConversionAgent — Product Overview

## Vision

ConversionAgent is an **AI CMO platform** — an autonomous marketing agent that can plan, budget, launch, optimize, and scale YouTube advertising campaigns on behalf of businesses and their agencies.

Think of it as hiring a world-class Chief Marketing Officer who works 24/7, never misses a data point, and can act — not just advise. Users interact with the agent via **chat or voice**, and the agent handles the full campaign lifecycle end-to-end.

---

## Defensibility & Moat (the real idea)

**Be honest about what is NOT the moat.** "Talk to your app and AI fills the forms" (voice + LLM tool-calling that drives the UI) is a *feature*, not a startup — AI copilots are table stakes and dictation is a crowded, solved category (Wispr Flow, Superwhisper, etc.). The voice/agent layer is the cherry, not the cake.

**The defensible idea is a white-label, voice-operated _vertical agency operating system_** for a specific niche — **local home-service + ecom physical-product businesses** — where the agent doesn't just chat, it ties together **proprietary, integrated data the client can't get elsewhere:**

- **First-party ad attribution** (orders/leads matched to the exact Google/Meta/TikTok campaign IDs — beats the platforms' self-reported numbers).
- **Payments / QuickBooks** (real collected revenue, incl. manual cash/check/Zelle).
- **Funnels + landing pages** (the conversion surface we own end-to-end).
- **Manufacturing / unit economics** (BOM → COGS → contribution margin → max allowable CAC — the factory floor wired to the checkout).

**The moat = integration depth + niche focus + execution, not the voice.** The whole business runs hands-free through one agent, white-labeled to the client.

**Closest competitor to answer for:** **GoHighLevel** — the dominant generalist white-label agency platform (CRM/funnels/campaigns) now adding AI. Every pitch must answer *"why not HighLevel + AI?"* Our honest edge: **attribution depth + local/ecom-specific operations** (true CAC-vs-margin, manufacturing costing) a generalist platform doesn't do well.

> One-liner: *the AI operating system that connects a local/product business's factory floor to its checkout — and runs it for them.*

---

## Business Model & Pricing (Framework)

> Critical framing for how we price our work **and** how we help clients price theirs. There are **two linked pricing problems** — how the *client* prices their product, and how *we* price our services to them. The first is the **input** to the second.

### The cost-structure insight (software vs. manufacturing)
- **Software:** cost is in the **first unit** (the build). Each additional copy/deploy is ~$0, so **margins improve with every client.** "Manufacturing" is the right word only for the *process* (idea → build → ship), not the *cost structure*.
- **Physical products:** cost is in **each unit** (materials + labor). Margin is roughly **flat per unit** and only improves with scale / bulk buying.

### What we are: a productized service
We build **reusable products** (Control Center, funnels, ops software) and deploy **customized instances** per client. Leverage = reuse. We are *not* a custom job shop billing hours; we ship customized copies of a reusable product. Pricing follows directly:
- **One-time setup/build fee** → recovers the bespoke build (the "tooling").
- **Monthly recurring** → monetizes the reusable asset (high margin, compounds with each client).

### Our pricing menu (price each service differently)
| Service | Model |
|---|---|
| Paid ads | Monthly retainer **+** % of ad spend (~10–15%) or performance (per lead/sale) |
| Custom software | Setup fee **+** monthly SaaS/license **+** support. Prefer **build-and-license** (we own IP, recurring, resellable) over build-for-hire |
| Advisory / process consulting | Fixed project fee, or bundle in to justify premium |
- **Avoid pure hourly** as the core model — it caps upside and penalizes getting faster.
- When embedded across marketing + software + ops → consider a **bundled retainer** and **rev-share / small equity** (capture the upside, not just fees).

### Pricing physical-product clients (e.g., RV window covers)
Map their unit economics with them:
1. **BOM** (bill of materials): every component × cost + a **scrap/waste %**.
2. **Routing:** time each labor step × loaded rate.
3. **COGS** = materials + labor + variable overhead. Separate **fixed costs** (equipment, rent, *our software*).
4. **Contribution margin** = price − COGS − shipping − fees − per-order ad cost → drives **max allowable CAC**.

**The bridge to our ad business:** their contribution margin is the **ceiling on what we can spend to acquire a customer.** So *their manufacturing math is our marketing math* — it sets target ROAS / max CPA. DTC products sold on paid ads generally need **~60–75% gross margin** to survive acquisition + returns + shipping.

### What ties it together
One **unit-economics model** is simultaneously (a) the client's pricing tool, (b) the **spec** for the ops software we build them, and (c) the **justification** for our ad fees. Same model → three revenue streams. Positioning: **we connect the factory floor to the checkout.**

> Note: general business reasoning, not formal financial/accounting advice.

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
