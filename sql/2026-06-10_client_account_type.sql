-- Account-type template system. Drives which dashboard, labels, and modules a
-- client gets. 'home_service' (default, lead-gen) | 'ecom' (Shopify control center).
-- Supersedes the earlier is_ecom boolean (kept in sync for backward compat).

alter table client
  add column if not exists account_type text default 'home_service';

-- Backfill: anything already flagged ecom, and ShieldTech, become 'ecom'
update client set account_type = 'ecom' where is_ecom = true;
update client set account_type = 'ecom' where client_id = 'ch069';

-- Keep is_ecom aligned for the existing nav/contacts checks
update client set is_ecom = (account_type = 'ecom');
