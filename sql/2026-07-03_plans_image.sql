-- Plans: cover image for timeline bars (Airbnb listing photo, city shot, …)
-- Run this in Supabase SQL editor
alter table public.plans add column if not exists image_url text;
