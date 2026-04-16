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

### 4. Full Autonomous Loop
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
- ✅ Google Ads API sync working (YouTube campaign data)
- ✅ Company page with team member management (create, edit, delete users)
- ✅ Video scripts module
- ✅ Contacts/leads module
- ⏳ Google Ads Standard Access (pending Google approval)
- ⏳ AI agent chat/voice interface
- ⏳ HeyGen video generation pipeline
- ⏳ Autonomous campaign management

---

## Name

Working between **ConversionAgent** and **AgentHero** — decision pending.
