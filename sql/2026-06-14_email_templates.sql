-- Editable system email templates (agency-level). Built-in defaults live in
-- lib/email-templates.js; a row here overrides the default for that key. Both
-- the live send and the in-app preview render from the same place, so they
-- never drift. Edited from the agency Email Templates page (and, later, by an
-- agent — it's just rows). Read/written server-side via the service role only.

create table if not exists email_templates (
  key        text primary key,   -- e.g. 'welcome_user'
  name       text,
  subject    text,
  html       text,
  updated_at timestamptz default now()
);
