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

Everything persists in the database now: findings, decisions, and taught
rules survive devices and sessions, and a **nightly cron watcher** re-runs
the rules for every ecom client while nobody is looking.

- **y / Approve** — records the decision, snapshots a 7-day baseline, and
  consults the LEVERS setting (shown in the status bar):
  **off** = log only · **dry_run** (default) = the exact Google/Meta API
  request + rollback plan is built and recorded but NEVER sent ·
  **live** = the pause/budget change actually executes, with rollback
  info stored on the decision.
- **Measured impact** — ~7 days after each approval the watcher compares
  net-per-day before vs after and writes the result next to the estimate
  in the Ledger. Whole-account and directional, not campaign-isolated —
  receipts, not claims.
- **Undo** — reverts the decision and reopens the card. If a lever ran
  live, reversing the platform change is manual (rollback details are on
  the decision) and the terminal warns you.
- **n / Dismiss + teach** — your reason becomes a standing rule checked by
  BOTH the page watcher and the nightly cron.
- **The agent's hands are UI-only**: open tabs, change range, reopen
  decisions, draft cards, and render charts/tables (which you can 📌 pin
  as files in the explorer). It can never approve its own cards.
- **Keyboard**: ⌘P jumps to any view, pin, or campaign · ⌘K commands ·
  ctrl+\` panel · ⫿ splits the editor side-by-side · headers click-sort.

## The roadmap (each step gated on your sign-off)

1. ✅ Watcher, drafted actions, grounded Q&A
2. ✅ Database persistence + nightly cron + Slack alerts on new highs
3. ✅ Measured outcomes (estimates → receipts)
4. ✅ Levers built — currently in dry_run; flipping MISSION_LEVERS to
   live is a deliberate, reversible switch
5. **Next** — tripwires ("auto-flag if under 1.0x for 3 straight days"),
   campaign-isolated measurement, per-action policy caps for live mode

The order is deliberate: the watcher earned trust with receipts before it
got hands — and the hands stay in dry-run until you flip the switch.
`
