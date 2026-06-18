-- CX-POLISH-4 — optional human-readable location label on a community post (e.g. "Fitzroy").
-- Auto-populated from the business suburb/city on create; owner can toggle it off. No lat/lng in v1.
alter table public.community_posts add column if not exists location_tag text;
