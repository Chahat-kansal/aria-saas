# Prompt 111 — Bookings: Complete to Deputy/HotDoc Standard

## Pre-flight
```
git pull origin main
npx tsc --noEmit
npm run build
```
Read ALL existing files: src/app/dashboard/bookings/, src/app/api/pos/ bookings-related routes, any public booking page. Understand what exists before writing anything.

## DB columns (already exist)
bookings: id, business_id, customer_id, customer_name, booking_date, booking_time, service, service_id, status, source, amount, duration_minutes, party_size, customer_email, customer_phone, notes, reminder_sent_at, confirmed_at, cancelled_at, cancellation_reason, aria_notes, updated_at, booking_token
booking_services: id, business_id, name, duration_minutes, price, description, is_active, color
booking_slots: id, business_id, service_id, staff_member_id, date, start_time, end_time, is_available, is_blocked, booking_id

## TASK 1 — Availability engine
Create src/app/api/bookings/availability/route.ts
GET params: service_id, date (YYYY-MM-DD), business_id
- Get service duration from booking_services
- Get business hours (from businesses or a settings table)
- Get all booked slots for that date (booking_slots where date=X and is_available=false)
- Generate available time slots (every 15/30 min depending on service)
- Return: [ { time: "09:00", available: true }, ... ]
Commit: "feat(bookings): real availability engine based on service duration + existing bookings"

## TASK 2 — Public booking page
Create src/app/book/[slug]/page.tsx (public, no auth):
Uses businesses.booking_link_slug to resolve business.
Step flow:
1. Pick service (from booking_services)
2. Pick date (calendar)
3. Pick time (from availability API)
4. Enter name + email + phone + notes
5. Confirm → creates booking, sends confirmation email (SendGrid)

The confirmation email includes booking_token link for self-cancellation.
Commit: "feat(bookings): public booking page at /book/[slug]"

## TASK 3 — Self-cancellation
Create src/app/book/cancel/[token]/page.tsx:
- Show booking details
- "Cancel booking" button → PATCH booking status='cancelled', cancellation reason
- Sends cancellation confirmation email
- Frees up the slot (update booking_slots)
Commit: "feat(bookings): self-cancellation via booking token"

## TASK 4 — Reminders cron
Add to existing daily cron:
- Find bookings where booking_date = tomorrow AND reminder_sent_at IS NULL AND status='confirmed'
- Send reminder SMS (Twilio) or email (SendGrid) based on what contact info exists
- Update reminder_sent_at=now()
Commit: "feat(bookings/cron): 24h reminder via SMS/email"

## TASK 5 — Dashboard
Ensure src/app/dashboard/bookings/ has:
- Calendar view: day/week/month toggle, bookings shown as coloured blocks
- List view: date | time | customer | service | status badge | duration | amount
- Create booking manually (for phone bookings)
- Click booking → detail modal: customer info, service, notes, Aria notes (AI summary of customer history), confirm/cancel/reschedule actions
- Services management: add/edit/delete booking_services
- Availability settings: business hours, blocked dates
- "Copy booking link" button → copies /book/[slug] to clipboard
Commit: "feat(bookings/dashboard): complete bookings management UI"

## Rules
- booking_token: generate as nanoid(16) on creation
- All amounts dollars not cents
- npx tsc --noEmit + npm run build before each commit
