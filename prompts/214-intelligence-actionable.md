# Prompt 214 — Intelligence: One-Click Fix Actions + Hypothesis Outcomes + Pattern Memory

Read CLAUDE.md first. Read src/app/dashboard/intelligence/page.tsx IN FULL before touching it.
Read src/app/api/intelligence-events/ routes before touching them.

## WHAT EXISTS
- Event feed with categories, priority, acknowledge/dismiss
- Hypothesis list with predicted impact
- Stats and realtime subscription
- action_label + action_href fields on events (but UI only shows them as a link)

## TASK 1 — One-click fix actions on every event card
Commit: "feat(intelligence): one-click fix actions wired to real endpoints"

Read the full IntelligenceEvent interface. The event card currently shows action_label/action_href as a link.
Replace with a proper action button that calls the right endpoint directly from the card:

Event type → action:
- `low_stock` / `reorder` → POST /api/pos/purchase-orders with product_id from event.data → button "Create reorder"
- `pricing_gap` / `price_below_cost` → PATCH /api/pos/products/{product_id} with suggested_price from event.data → button "Update price"
- `dead_stock` → POST /api/pos/promotions with 20% discount on the product → button "Markdown 20%"
- `slow_day` / `quiet_period` → redirect to /dashboard/promotions with prefilled flash deal → button "Run a special"
- `churn_risk` / `lapsed_customers` → POST /api/aria/winback with customer_ids from event.data → button "Send winback"
- `review_unreplied` → redirect to /dashboard/reviews → button "Reply now"
- `expiry_alert` → redirect to /dashboard/warehouse?tab=expiry → button "View expiry"
- All others → keep existing action_href link if present, else "Dismiss"

Each action button:
- Shows loading state while the API call is in flight
- On success: marks event as acknowledged + shows a success toast "Done — [what was done]"
- On error: shows inline error, does NOT dismiss
- Uses haiku to log the action to aria_autopilot_actions

Add `actionFiring` state: Record<string, boolean> to track per-event loading.

## TASK 2 — Hypothesis outcome tracking
Commit: "feat(intelligence): hypothesis outcome validation — did Aria's suggestion work?"

Read the Hypothesis interface. Currently shows title, description, predicted_impact, status.
Add outcome tracking:

When hypothesis.status === 'active' AND generated_at is > 14 days ago:
- Show a "Did this work?" card below the hypothesis row
- Three buttons: "✓ Yes, it worked", "✗ Didn't work", "~ Inconclusive"
- POST /api/aria/hypotheses/{id}/outcome { verdict: 'worked'|'failed'|'inconclusive', notes: string }
- This updates hypothesis.outcome_verdict + status = 'closed'
- Log to aria_autopilot_actions { action_type: 'hypothesis_outcome', verdict }

Add a "Validated" section below active hypotheses showing closed ones with verdict badges:
- "✓ Worked" in green, "✗ Didn't work" in red, "~ Inconclusive" in amber
- Show actual_impact if available vs predicted_impact

Create the API route if it doesn't exist:
src/app/api/aria/hypotheses/[id]/outcome/route.ts
PATCH: { verdict, notes } → update hypothesis row → return updated hypothesis

## TASK 3 — Pattern memory ("This happened before")
Commit: "feat(intelligence): pattern memory — show when similar events happened before"

When an event card is expanded (selected), fetch pattern history:
GET /api/intelligence-events/patterns?event_type={type}&business_id={bid}&limit=3

This returns the last 3 similar events with their resolution status and what worked.

Create the route if missing:
src/app/api/intelligence-events/patterns/route.ts
GET: query intelligence_events WHERE event_type = $type AND business_id = $bid AND triggered_at < NOW() - INTERVAL '7 days' ORDER BY triggered_at DESC LIMIT 3

In the expanded event detail panel, show a "Pattern history" section:
- "This has happened 2 times before"
- List: date + what was done (acknowledged_note or action taken) + outcome if known
- If 0 previous: "First time we've seen this"
- If pattern shows recurring issue: Aria generates a 1-sentence pattern insight using haiku

## TASK 4 — Feed outcomes back into daily briefing
Commit: "feat(intelligence): hypothesis outcomes feed into buildAskAriaContext"

In buildAskAriaContext (or wherever briefing context is built), add:
- Count of hypotheses that worked vs didn't this month
- Pattern: "Aria's suggestions have an X% success rate this month"
- If a recurring unresolved pattern exists: flag it in briefing

## RULES
- Read every file fully before editing
- One commit per task
- npx tsc --noEmit + npm run build before every commit
- Use claude-haiku-4-5-20251001 for AI calls
- UPGRADE-ONLY: do not remove any existing intelligence features
