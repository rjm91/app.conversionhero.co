-- Per-client: tabs a client_admin has hidden from their client_standard users.
-- Layered on top of agency tab_access. A client_standard user sees a tab only if
-- (a) it's client-visible (agency tab_access / base) AND
-- (b) the client_admin hasn't hidden it here.
-- Missing key = visible to standard users (default allow).
--
-- Example: { "company": true, "billing": true }  (hidden from client_standard)

alter table client
  add column if not exists standard_hidden_tabs jsonb not null default '{}'::jsonb;
