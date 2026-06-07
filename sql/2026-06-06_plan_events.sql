-- Plan events — generalize `plans` beyond lodging stays.
-- Adds an event type, an optional time-of-day, and a single cost field used by
-- non-stay events (stays keep using the categories budget). Safe to re-run.
--
-- type values: 'stay' | 'dinner' | 'hangout' | 'flight' | 'event'
--   stay  → multi-day, uses start_date/end_date + categories budget (unchanged)
--   other → single-day points; store end_date = start_date, amount in `cost`
--
-- start_time: 'HH:MM' 24h string, optional (e.g. '18:00' for "Boys Dinner @ 6pm")
-- cost:       numeric amount for non-stay events (stays ignore this; they sum categories)

alter table plans add column if not exists type       text    not null default 'stay';
alter table plans add column if not exists start_time  text;
alter table plans add column if not exists cost        numeric not null default 0;
