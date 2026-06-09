-- Flags a client as an ecommerce (Shopify-connected) account. Drives the
-- "Customers / Orders" relabeling (vs "Contacts / Leads") in the nav and the
-- Contacts page. Set true for each Shopify client.

alter table client
  add column if not exists is_ecom boolean default false;

update client set is_ecom = true where client_id = 'ch069';  -- ShieldTech
