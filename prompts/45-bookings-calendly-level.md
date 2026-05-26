# Prompt 45 — Bookings: Calendly + Acuity-Level Pro Upgrade

## Category leader bar
Calendly: self-booking links, payment collection, Google Calendar sync, buffer times, cancellation/rescheduling, availability rules, reminder sequences, group bookings, team scheduling.
Acuity: all above + intake forms, packages, subscriptions, no-show tracking.
Aria must match 80% of this AND add AI differentiation.

## Pre-edit checklist (MANDATORY — read ALL before writing one line)
1. `cat src/app/dashboard/bookings/page.tsx` — full read (22KB)
2. `cat src/app/api/bookings/route.ts` — full read
3. `cat src/app/api/bookings/services/route.ts` — full read
4. `cat src/app/api/bookings/remind/route.ts` — full read
5. Check DB via Supabase MCP: `bookings`, `booking_services` table — ALL columns
6. `cat src/app/api/invoices/send/route.ts` — for Resend email pattern
7. `cat src/lib/aria/intelligence/alerts.ts` — for Twilio SMS pattern
8. Check `businesses` table has `booking_link_slug`, `google_calendar_token` columns

## AI differentiation (what beats Calendly)
Aria AI features Calendly doesn't have:
- **Smart scheduling**: "When should I schedule my team meeting?" → Aria analyses everyone's busy periods and suggests optimal slot
- **No-show prediction**: before each booking, Aria scores likelihood of no-show (0-100%) based on customer history
- **Revenue optimisation**: Aria suggests which time slots to promote based on historically slow periods
- **AI intake summary**: customer fills intake form → Aria summarises key info for the owner before the appointment

## Features to build — no stubs, no TODOs

### 1. Public self-booking page
Route: `/book/[slug]` — public, no auth required.
Owner gets a unique link: `ariaos.site/book/sip-cafe`
Page shows: business name, services with prices/durations, available time slots, booking form.
Customer selects service → picks date → picks time → enters name/email/phone → confirms.
Available slots: calculated from business hours minus existing bookings minus buffer time.
Store `booking_link_slug` on businesses table.
Build: `src/app/book/[slug]/page.tsx` — server component, fetches business + services + availability.
Build: `src/app/api/bookings/public/route.ts` — POST to create booking without auth (public endpoint).

### 2. Availability rules
In services settings: owner sets their availability.
Days available: checkboxes Mon-Sun.
Hours: start time → end time per day.
Buffer time between appointments: 0/15/30/60 minutes dropdown.
Max bookings per day: number input.
Store in `booking_availability` table:
```sql
CREATE TABLE IF NOT EXISTS booking_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id),
  day_of_week integer CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sunday
  start_time time,
  end_time time,
  is_available boolean DEFAULT true,
  buffer_minutes integer DEFAULT 15,
  max_bookings_per_day integer DEFAULT 20,
  created_at timestamptz DEFAULT now()
);
```

### 3. Payment collection at booking
On public booking page: if service has price > 0, show Stripe payment step.
Use existing Stripe integration.
On booking confirmation: charge card, mark booking as `paid`.
Show receipt email with booking confirmation + payment receipt.
Add to bookings table: `paid_at timestamptz`, `payment_amount numeric`, `stripe_payment_intent_id text`.

### 4. Cancellation and rescheduling
Confirmation email includes: "Cancel booking" and "Reschedule" links.
Links go to `/book/[slug]/manage?token={booking_token}` — public page.
`booking_token`: random UUID stored on booking, emailed to customer.
Cancel: marks booking as `cancelled`, triggers refund if paid.
Reschedule: shows available slots, customer picks new time, updates booking.
Add: `booking_token text`, `cancelled_at timestamptz`, `rescheduled_from uuid` to bookings table.

### 5. Smart reminder sequences
Currently: single reminder. Upgrade to sequence:
- 24 hours before: "Reminder: your appointment at [business] tomorrow at [time]"
- 2 hours before: "Your appointment is in 2 hours — [address]"
- Post-appointment: "How was your visit? Leave us a review: [google_review_link]"
Cron: `src/app/api/cron/booking-reminders/route.ts` — runs every hour, sends due reminders.
Track sent reminders in `booking_reminder_log` table.

### 6. No-show tracking and AI prediction
If booking passes without being marked `completed` → auto-mark as `no_show` after 30 minutes post start time.
AI no-show score on each upcoming booking:
Call Claude Haiku: given customer's booking history (previous no-shows, cancellations, average spend) → score 0-100.
Show on booking card: "⚠️ 73% no-show risk" in amber if >60%.
Log to `aria_ai_calls`.
Store `no_show_score integer` on bookings.

### 7. AI revenue optimisation banner
Top of bookings page: Aria insight card.
"Your slowest booking slot is Tuesday 2-4pm. Consider a 10% discount to fill these slots."
Pulls from: which time slots have lowest occupancy + which services are most profitable.
Call `/api/aria/booking-insights?business_id={id}` — build this route.
Log to `aria_ai_calls`.

### 8. Calendar view upgrade
Current calendar is basic. Upgrade:
- Week view: each day = column, each booking = coloured block showing time + customer name + service
- Colour by service type
- Click booking block → side panel with full booking details + actions (confirm/cancel/mark complete)
- "Today" button to jump to current week
- Mini month navigator on left

## DB migrations (run via Supabase MCP FIRST)
```sql
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS booking_link_slug text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS booking_buffer_minutes integer DEFAULT 15;
CREATE TABLE IF NOT EXISTS booking_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id),
  day_of_week integer,
  start_time time,
  end_time time,
  is_available boolean DEFAULT true,
  buffer_minutes integer DEFAULT 15,
  max_bookings_per_day integer DEFAULT 20,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_token text DEFAULT gen_random_uuid()::text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS rescheduled_from uuid;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS paid_at timestamptz;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_amount numeric;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS no_show_score integer;
CREATE TABLE IF NOT EXISTS booking_availability_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id),
  day_of_week integer,
  start_time time,
  end_time time,
  is_available boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS booking_reminder_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES bookings(id),
  reminder_type text,
  sent_at timestamptz DEFAULT now(),
  channel text
);
```

## Routes to build
- `src/app/book/[slug]/page.tsx` — public booking page
- `src/app/book/[slug]/manage/page.tsx` — cancel/reschedule page
- `src/app/api/bookings/public/route.ts` — public POST (no auth)
- `src/app/api/bookings/availability/route.ts` — GET available slots
- `src/app/api/aria/booking-insights/route.ts` — AI revenue optimisation
- `src/app/api/cron/booking-reminders/route.ts` — reminder sequence cron
Add to vercel.json: `{"path":"/api/cron/booking-reminders","schedule":"0 * * * *"}`

## Design
- Public booking page: clean white/light theme (customers see this, not dark dashboard)
- Dashboard calendar: Financial Trust dark palette
- Booking blocks: green (#7FB897) for confirmed, amber for pending, red for cancelled, grey for no-show
- No-show risk badge: amber pill "73% risk" on card
- Fraunces italic for business name on public page

## Quality bar
Must feel as polished as Calendly's public booking page. Owner dashboard must feel as powerful as Acuity.

## Execution order
1. Run ALL DB migrations via Supabase MCP
2. Read ALL pre-edit files
3. Build availability route
4. Build public booking route + page
5. Build manage page (cancel/reschedule)
6. Build booking-insights AI route
7. Build booking-reminders cron
8. Upgrade `src/app/dashboard/bookings/page.tsx` — additive only, keep existing features
9. `npx tsc --noEmit` — zero TS errors
10. `npm run build` — must pass
11. `git add -A && git commit -m "feat: bookings — Calendly-level self-booking, payments, cancellation, smart reminders, no-show AI prediction, revenue optimisation" && git push`
