// The Mission Control manual — rendered by the ? modal and /manual command.
// This is the safety contract as much as it is documentation: keep it honest,
// keep it current when features land.

export const MANUAL = `
## What this is

Mission Control is a session, not a dashboard. The scrollback IS the app:
watcher findings, your questions, the agent's answers, and your decisions
all appear as turns, in order. Scroll up and you are reading the audit
trail — nothing important lives anywhere else.

You drive it with the keyboard: **j/k** selects the pending card, **y**
approves, **n** dismisses and teaches, **⌘K** opens the command palette,
and **/** commands run instantly without the AI.

## Where the numbers come from

Every figure is computed from your own data, the same way the main
dashboard computes it:

- **Revenue and orders** — your Shopify orders, bucketed to your calendar day
- **COGS** — your real bill of materials (Manufacturing tab), not estimates
- **Ad spend** — daily Google and Meta campaign rows, synced from the platforms
- **True ROAS** — (UTM-attributed revenue − real COGS) ÷ spend. Breakeven is
  exactly **1.00x**: below it a campaign burns margin, not just "underperforms"
- **Paid vs organic never mixes** — organic revenue cannot inflate ROAS

When you ask a question, the AI receives exactly these numbers — including
a per-day series — and is instructed to answer ONLY from them. If it can't
answer from the data, it says so instead of guessing.

## The Watcher

A set of deterministic rules (no AI involved) that runs every time the
page loads or the range changes:

1. **Margin bleeder** — an enabled campaign with ≥$200 spend, ≥4 days of
   data, attributed orders, and True ROAS below 1.00x. Estimates the
   monthly contribution loss.
2. **Tracking check** — spend with ZERO attributed orders is flagged as
   "verify UTMs" instead of a bleed claim, because broken tracking looks
   identical to a failing campaign.
3. **Scale headroom** — a winner at ≥2.0x with real volume (≥$500 spend,
   ≥5 attributed orders) gets a +20% budget-test draft.
4. **Klaviyo under-use** — email/SMS below 10% of revenue (healthy ecom
   runs 15–30%).
5. **Attribution health** — under 50% of orders matched to a campaign
   means every per-campaign number is partly blind.

Campaigns under 4 days old are ignored entirely — attribution lag makes
early reads noise.

## What the buttons actually do (today)

- **y / Approve** — writes the decision to a local ledger. **It does NOT
  touch Google, Meta, or any platform.** No spend changes, no pauses,
  nothing leaves this page. The ledger is stored in this browser.
- **n / Dismiss + teach** — your reason becomes a standing rule. The
  watcher checks taught rules before proposing and will not re-surface
  that finding. **/policies** lists everything you've taught.
- **Slash commands** — computed locally from the loaded data, instantly,
  no AI: /campaigns /forecast /pause /scale /ledger /policies /range
- **Anything else you type** — goes to Claude (claude-opus-4-8) with this
  page's numbers as its only source of truth.

## The roadmap (each step gated on your sign-off)

1. **Now** — page-load watcher, drafted actions, grounded Q&A, local ledger
2. **Cron watcher** — same rules on a server schedule, so findings exist
   before you look and can ping you in Slack. Adds a daily metrics rollup
   table and a real findings/ledger table in the database
3. **Tripwires** — standing conditions like "auto-flag if a campaign
   prints under 1.0x for 3 consecutive days"
4. **Real levers** — approve actually pauses/scales via the platform APIs,
   with rollback points, capped by explicit policies (e.g. budget moves
   ≤$50/day), and client-facing actions always human-approved

The order is deliberate: the watcher earns trust with receipts before it
gets hands.
`
