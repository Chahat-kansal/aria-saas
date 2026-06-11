# S26 — Bookings Calendly-level
STATUS: PARTIAL | MODE: SOLO
Covers: prompts/45
Missing: buffer time rules between appointments, multi-staff allocation, online deposit payment

---

## RULE 0 — UPGRADE ONLY
Protected files (never touch): AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts, aria-voice-guide.ts

## CONSTRAINT CATALOGUE
Tables: bookings (status, booking_date, booking_time, duration_minutes, service_id, booking_token)
        booking_services, booking_slots, businesses (booking_buffer_minutes, booking_link_slug)
Run live SQL before any edit.

## Gap closure scope

### Gap 1 — Buffer time between appointments
- businesses.booking_buffer_minutes already exists (AUDIT_STATE.md confirms)
- Ensure booking slot calculation respects: slot_end = booking_start + duration + buffer_minutes
- UI: in /settings/bookings → buffer time field (already has the column, just needs UI if missing)

### Gap 2 — Multi-staff allocation
- booking_services: add `requires_staff_count` integer (nullable, default 1)
- On booking: if requires_staff_count > 1, require N staff to be available
- UI: service edit → "Staff required" number input

### Gap 3 — Online deposit via Stripe
- On public booking page: if service has `deposit_amount_cents` > 0 → show Stripe payment intent
- Create Stripe PaymentIntent for deposit_amount_cents
- On payment: update booking status='deposit_paid'
- booking_services: add `deposit_amount_cents` integer (nullable, default 0) — migration if not present

## Aria Intelligence Rule
- Booking confirmed with deposit → aria_ai_calls log (if any AI involved)
- No-show pattern → upsertAriaAction 'Consider requiring deposits for this service'

## Build gate
```
npx tsc --noEmit && npm run build
```

## Founder verify checklist
- [ ] Create booking → buffer time respected in slot availability
- [ ] Service with 2-staff requirement → shows only slots when 2 staff available
- [ ] Online booking with deposit → Stripe payment flow works
- [ ] Deposit captured in Stripe dashboard

## Push
SOLO mode — stop before push. Write reports/sprint-S26-report.md.
