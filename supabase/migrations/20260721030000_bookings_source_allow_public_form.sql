-- Found while race-testing FLOOR-1's confirm_booking_atomic(): bookings_source_check never
-- allowed 'public_form', the exact value /api/bookings/public's POST has used since it was
-- built (src/app/api/bookings/public/route.ts) — meaning every real public booking submission
-- through the live /book/[slug] page has been failing this constraint with a 500. Confirmed via
-- Sip Café's own booking history: all 3 existing rows are source='manual' (dashboard-entered),
-- zero are 'public_form', despite the public route existing and being reachable.
-- Additive: extends the allowed list rather than renaming the app's existing label.
alter table bookings drop constraint bookings_source_check;
alter table bookings add constraint bookings_source_check
  check (source = any (array['instagram','facebook','sms','google','direct','manual','phone','walk-in','website','app','public_form']));
