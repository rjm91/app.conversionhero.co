-- First-ever order per customer, aggregated in the database. Replaces the
-- browser's full-history email scan (every mission load pulled every order's
-- email over the wire) with one indexed aggregate query. security_invoker →
-- client_orders RLS applies to whoever reads the view.
create or replace view public.client_first_orders with (security_invoker) as
select client_id, lower(email) as email, min(created_at) as first_at
from public.client_orders
where email is not null and btrim(email) <> ''
group by client_id, lower(email);
