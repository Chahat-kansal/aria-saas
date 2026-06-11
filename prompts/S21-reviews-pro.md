# S21 — Reviews BirdEye-level
STATUS: PARTIAL | MODE: BATCH
Covers: prompts/36, 42
Missing: NPS cohort view, multi-platform aggregation panel

---

## RULE 0 — UPGRADE ONLY
Protected files (never touch): AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts, aria-voice-guide.ts

## CONSTRAINT CATALOGUE
Tables: google_reviews (has_reply column — NOT reviews.response), pos_customers
Run live SQL before any edit.

## Gap closure scope

### Gap 1 — NPS cohort view
- Group customers by NPS score range: Promoters (9-10), Passives (7-8), Detractors (0-6)
- Show count + % in each group, with trend vs last 30 days
- Source: reviews or pos_customers where nps_score column exists (check if it exists first)

### Gap 2 — Multi-platform review aggregation
- Currently only Google reviews
- Add: Facebook reviews (if connected via social_connections)
- Aggregate: average rating across all platforms, total review count
- Platform breakdown: show per-platform rating bar

## Aria Intelligence Rule
- Negative review spike → upsertAriaAction category='reviews', priority='high'
- Feed avg rating + review velocity into aria_daily_briefings
- aria_ai_calls: log AI review reply suggestions

## Build gate
```
npx tsc --noEmit && npm run build
```

## Founder verify checklist
- [ ] /dashboard/reviews → NPS breakdown panel visible
- [ ] Multi-platform panel shows Google + Facebook (if connected) ratings
- [ ] AI reply suggestion generated; has_reply column updated when replied
- [ ] google_reviews.has_reply (NOT reviews.response) used throughout

## Push
BATCH mode.
