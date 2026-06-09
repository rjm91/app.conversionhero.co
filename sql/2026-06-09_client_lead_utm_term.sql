-- Adds utm_term to client_lead (the ad-set ID for Meta traffic; the 5th UTM
-- parameter Shopify captures). Populated by /api/sync-shopify-orders and shown
-- in the Contacts detail panel alongside the other UTM IDs.

alter table client_lead
  add column if not exists utm_term text;
