-- Holds Shopify-order-specific fields for leads synced from a Shopify store
-- (order #, sales channel, payment/fulfillment status, item count, delivery
-- method). Kept in one JSONB column so the generic client_lead schema stays
-- clean. Populated by /api/sync-shopify-orders; read by the Contacts page when
-- the client is an ecom (Shopify-connected) account.

alter table client_lead
  add column if not exists shopify_data jsonb;
