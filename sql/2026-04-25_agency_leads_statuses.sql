-- Mirror the client_lead status columns on agency_leads so agency-level
-- leads can move through the same Lead/Appt/Sale pipeline.

alter table agency_leads
  add column if not exists lead_status text default 'New / Not Yet Contacted',
  add column if not exists appt_status text,
  add column if not exists sale_status text,
  add column if not exists sale_amount numeric,
  add column if not exists appt_date  date,
  add column if not exists appt_time  time,
  add column if not exists ch_notes   text;

update agency_leads
  set lead_status = 'New / Not Yet Contacted'
  where lead_status is null;
