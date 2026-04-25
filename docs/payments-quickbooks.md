# Payments / QuickBooks Integration

Status as of 2026-04-24.

## Goal

The `/control/payments` page should show all client payments — historical (manual)
plus new ones automatically pulled from QuickBooks.

## Current state

### Tables

- **`client_payments`** — what the Payments page reads from. Currently contains
  static rows imported manually from a Google Sheet CSV. Last manual row date:
  `2025-06-05`. Do not touch existing rows.
- **`client_qb_payments`** — raw QB invoice ingest, populated by
  `/api/quickbooks/sync-raw`. 256 rows, `txn_date` ranges
  `2021-11-15` → `2026-04-17`. Source of truth for QB data.
- **`qb_tokens`** — OAuth tokens, one row per realm. Working.
- **`client_billing.qb_customer_id`** — column where each client's QB customer ID
  is stored. Used to map QB invoices → clients. Currently mostly empty — this is
  the missing link.

### Routes

- [app/api/quickbooks/connect/route.js](../app/api/quickbooks/connect/route.js)
  — kicks off OAuth.
- [app/api/quickbooks/callback/route.js](../app/api/quickbooks/callback/route.js)
  — saves tokens to `qb_tokens`. **Has silent error swallowing**, no logging on
  failed upsert.
- [app/api/quickbooks/disconnect/route.js](../app/api/quickbooks/disconnect/route.js)
  — deletes the row from `qb_tokens`.
- [app/api/quickbooks/sync-raw/route.js](../app/api/quickbooks/sync-raw/route.js)
  — pulls all QB invoices into `client_qb_payments`. Safe to re-run.
- [app/api/cron/sync-payments/route.js](../app/api/cron/sync-payments/route.js)
  — old sync. **Do not use as-is** — it deletes/replaces all `merchant='QBO'`
  rows in `client_payments` and uses fuzzy name matching that misses anyone
  whose QB customer name doesn't fuzzy-match a client name (e.g. "Jamie Clark"
  vs. "Synergy Home").

### Env vars (Vercel, production)

- `QB_CLIENT_ID`, `QB_CLIENT_SECRET`, `QB_REDIRECT_URI`, `QB_REALM_ID`
- `QB_REALM_ID` must match the `realm_id` row in `qb_tokens` exactly, and must
  match the QB Company ID (Settings → Account and settings → Billing &
  Subscription).

## Remaining work

### 1. Map QB customers → clients

For each unique `customer_id` in `client_qb_payments`, set the matching
`client_billing.qb_customer_id`. Customer-name fuzzy matching is not reliable
because invoices use the *individual* name (e.g. "Jamie Clark"), not the
*company* name (e.g. "Synergy Home").

Inspect with:

```sql
select distinct customer_id, customer_name, count(*) as invoices
from client_qb_payments
group by customer_id, customer_name
order by invoices desc;
```

Then for each row, decide which `client_id` it belongs to and run:

```sql
update client_billing
set qb_customer_id = '<qb_customer_id>'
where client_id = '<client_id>';
```

Future improvement: a small UI page that lists unmapped QB customers with a
client-picker dropdown.

### 2. Append-only sync route

Build a new route (e.g. `/api/quickbooks/sync-to-payments`) that:

- Reads from `client_qb_payments` where `txn_date > '2025-06-05'`
- Joins to `client_billing.qb_customer_id` to resolve `client_id`
- Upserts into `client_payments` on `invoice_id` (no deletes)
- Skips invoices with no client mapping, returns the list of unmapped
  `customer_id`s in the response so we know what's left to map

This preserves the manual CSV rows and only appends new QB activity going
forward.

### 3. Schedule

Once #1 and #2 are working manually, wire the new sync route into a cron
schedule (Vercel cron or similar) so the page stays current without manual
trigger.

### 4. Deprecate old sync

Once the new route is verified, delete
[app/api/cron/sync-payments/route.js](../app/api/cron/sync-payments/route.js)
or replace its contents with the new logic.

## Quick reference

- Re-pull all QB invoices: hit `/api/quickbooks/sync-raw` (safe, idempotent).
- Reconnect QB: click "Connect QuickBooks" on `/control/payments`. Make sure to
  tick the `com.intuit.quickbooks.accounting` scope on the Intuit auth screen
  (this was previously unchecked and caused the empty-tokens issue).
- Disconnect: hit `/api/quickbooks/disconnect`.
