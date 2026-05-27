-- Add onboarding_status to agency_leads for tracking post-sale onboarding.
-- Leads with sale_status = 'Sold' enter onboarding and move through these stages
-- until a client record is created (promoting them to Active Clients).

alter table agency_leads
  add column if not exists onboarding_status text;
