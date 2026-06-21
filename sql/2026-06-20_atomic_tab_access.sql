-- Fix tab-visibility toggles silently reverting.
-- The API did read-modify-write on the whole jsonb column, so two near-simultaneous
-- toggles would clobber each other. These functions merge a SINGLE key atomically
-- in one statement (coalesce(col,'{}') || {key:value}) — race-free, order-independent.

create or replace function set_client_tab_access(p_client_id text, p_key text, p_visible boolean)
returns jsonb
language sql
as $$
  update client
  set tab_access = coalesce(tab_access, '{}'::jsonb) || jsonb_build_object(p_key, p_visible)
  where client_id = p_client_id
  returning tab_access;
$$;

create or replace function set_client_standard_hidden(p_client_id text, p_key text, p_hidden boolean)
returns jsonb
language sql
as $$
  update client
  set standard_hidden_tabs = coalesce(standard_hidden_tabs, '{}'::jsonb) || jsonb_build_object(p_key, p_hidden)
  where client_id = p_client_id
  returning standard_hidden_tabs;
$$;
