-- Track which Blaztr prospects have been synced into agency_leads.
-- blaztr_id is the Blaztr lead UUID; unique constraint prevents duplicates.

alter table agency_leads
  add column if not exists blaztr_id text unique;
