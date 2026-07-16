# Dates & Timezones

Status as of 2026-06-18.

## Goal

When a user picks **Today** (or any preset/custom range) on a dashboard, the
numbers should reflect **that user's local calendar day**, on the machine
they're logged in from — not UTC, not a server timezone. Whoever logs in,
wherever they are, "Today" means their today.

## The rule

**All date-range math is done in the viewer's local (browser) timezone.**
There is no stored per-client/business timezone — it follows the machine.

Each dashboard defines a small helper:

```js
// Local calendar date (YYYY-MM-DD) in the viewer's machine timezone — not UTC.
function localDay(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
```

> ⚠️ Never use `new Date().toISOString().slice(0,10)` to get "today". That's
> UTC, so every evening west of UTC (e.g. after ~5pm Pacific) it rolls to
> *tomorrow*. This was the original timezone-drift bug. Use `localDay()`.

## How a range becomes a query

1. **Preset → date strings.** `rangeFor(preset)` returns `{ start, end }` as
   `YYYY-MM-DD` strings built from `localDay()`. `today` = `{ start: today, end: today }`,
   `yesterday` = the prior local day, etc.

2. **Two kinds of columns get filtered two different ways:**

   - **Real timestamps** (`client_lead.created_at` — Shopify orders & leads).
     These are true UTC `timestamptz` values. We bound them by the local day's
     **actual instants**, converted to UTC:

     ```js
     const dayStartISO = new Date(`${start}T00:00:00`).toISOString()      // local midnight → UTC
     const dayEndISO   = new Date(`${end}T23:59:59.999`).toISOString()    // local 23:59:59.999 → UTC
     .gte('created_at', dayStartISO).lte('created_at', dayEndISO)
     ```

     `new Date('2026-06-18T00:00:00')` (no offset) parses as **local** time, so
     `.toISOString()` yields the correct UTC instant for that local day. An order
     at 11:50pm local counts toward that local day. (This replaced an old
     `+ 'T23:59:59-12:00'` fudge that approximated the boundary.)

   - **Date-only columns** (`client_google_campaigns.date`, `client_meta_campaigns.date`,
     `client_tiktok_campaigns.date`, `client_google_ads.date` — ad platform daily rows).
     These have no time component and are filtered with the plain local date
     strings: `.gte('date', start).lte('date', end)`. **See the caveat below.**

3. **Chart day-bucketing** uses `localDay()` too:
   - The x-axis is built by stepping local days from `start` to `end`.
   - Orders/leads are bucketed by `localDay(new Date(row.created_at))` — i.e.
     their **local** day — so an evening order lands on the right column.
   - Ad rows bucket by their `date` string as-is.

## Where this lives

- [components/EcomControlCenter.js](../components/EcomControlCenter.js) — ecom
  client dashboard. `localDay`, `defaultDates`, `rangeFor`, the `fetchData`
  Shopify filter, and the `trend` chart memo.
- [components/HomeServiceControlCenter.js](../components/HomeServiceControlCenter.js)
  — home-service client dashboard. Same helpers + lead filter + chart.

Both define their own `localDay` (kept local to avoid a shared-import change
while other work is in flight). If a third dashboard is added, copy the same
pattern.

## Known limitation — ad-account timezones

Google Ads and Meta report their daily metrics in **each ad account's own
configured timezone**, and we store that as the date-only `date` column. The
dashboard filters those with the viewer's local date — so **they only line up
when each ad account's timezone matches the viewer's timezone.**

Example: viewer on Pacific, Google Ads account set to Eastern → that account's
"today" row is on Eastern's calendar day, which can differ from the viewer's by
up to a few hours at the boundary. Shopify (real timestamps) will be exact;
Google/Meta can be off by a day near midnight.

**Mitigation today:** set each client's Google Ads / Meta ad accounts to the
same timezone the team reads the dashboard in.

**Proper fix (not built):** add a per-client business timezone (`client.timezone`)
+ a settings UI, and convert all comparisons through it instead of the browser.
That makes "today" stable regardless of where the user logs in and lets us
normalize ad-account dates. Tracked as a future enhancement.

## Not yet converted

These still compute ranges in UTC and should get the same `localDay` treatment
if they start mattering for day-precise views:

- [app/control/page.js](../app/control/page.js) — agency overview date picker.
- [app/control/[clientId]/contacts/page.js](../app/control/[clientId]/contacts/page.js)
  — Contacts page range selector (`rangeBounds`).
