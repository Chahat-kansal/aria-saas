-- BOOKINGS-MOCKUP-MATCH — full layout editor support for pos_tables.
-- Additive only. rotation/width/height enable real drag/resize/rotate (the render previously
-- ignored pos_x/pos_y entirely, using flex-wrap-by-section instead — kept as the default
-- 'grouped' layout for the terminal's existing dine-in view; a new 'canvas' layout mode uses
-- these columns for true absolute positioning, matching the mockup's floor plan).
alter table pos_tables add column if not exists rotation integer not null default 0;
alter table pos_tables add column if not exists width integer not null default 72;
alter table pos_tables add column if not exists height integer not null default 72;
alter table pos_tables add column if not exists archived_at timestamptz;

-- element_type distinguishes real bookable tables from decorative, non-bookable room elements
-- (bar/counter/kitchen/entrance/wall/plant) so the floor plan reads like the actual room.
alter table pos_tables add column if not exists element_type text not null default 'table';
alter table pos_tables drop constraint if exists pos_tables_element_type_check;
alter table pos_tables add constraint pos_tables_element_type_check
  check (element_type = any (array['table','bar','counter','kitchen','entrance','wall','plant']));
