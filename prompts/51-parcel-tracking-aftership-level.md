# Prompt 51 — Parcel Tracking Pro Upgrade

## Category leader bar
AfterShip: real-time tracking from 1,100+ carriers, map view of shipment journey, branded tracking page, delivery analytics, exception alerts.
17track: multi-carrier, timeline view, delivery predictions.
Aria must match 80% for Australian small business context.

## Pre-edit checklist (MANDATORY — read ALL before writing one line)
1. `cat src/app/dashboard/parcel-tracking/page.tsx` — full read (22KB)
2. Check API routes: `src/app/api/pos/parcel-tracking/route.ts` if exists
3. Check DB: `parcel_tracking` table columns via Supabase MCP
4. Check if AfterShip API key is in env: `AFTERSHIP_API_KEY`

## AI differentiation
- Smart delivery prediction: "Based on carrier pattern, likely arrives Wednesday"
- Exception intelligence: "3 parcels stuck for 5+ days — Aria recommends actioning these"
- Cost analysis: "You've spent $340 on shipping this month — 23% above last month"

## Features to add

### 1. Live map view
Show shipment journey on a map using Google Maps or Leaflet (no API key needed).
Waypoints: origin → intermediate hubs → destination.
Current location marker (pulsing green dot).
Use carrier tracking data already fetched — extract location waypoints.

### 2. Australian carrier auto-detection
Detect carrier from tracking number format:
- Australia Post: 2 letters + 8 numbers + AU (e.g. EP123456789AU)
- Sendle: 8 alphanumeric
- DHL: 10 numbers
- FedEx: 12 or 15 numbers
- TNT: 9 numbers
Auto-set carrier on parcel creation.

### 3. Delivery analytics dashboard
New "Analytics" tab:
- Average delivery time by carrier (bar chart)
- On-time delivery rate % per carrier
- Exception rate % (failed/delayed deliveries)
- Monthly shipping cost trend
- Most used carrier this month
All from `parcel_tracking` data already in DB.

### 4. Exception alerts
Auto-flag parcels:
- Stuck: no scan update in 5+ days → "⚠️ Stuck"
- Delivery failed: carrier marked failed → "❌ Failed"
- Returned: carrier returning to sender → "↩️ Returned"
Show exception count badge on page nav.
Create `aria_actions` record for each exception.
Optionally: SMS owner for exception parcels.

### 5. Branded tracking page
Public page: `/track/[tracking_number]` — customer-facing.
Shows: carrier, status, timeline of events, estimated delivery.
Business logo + colours.
No login required.
"Contact us" button linking to business phone/email.

### 6. Bulk import
CSV import: tracking_number, carrier, customer_name, customer_email, order_ref.
Auto-send tracking update SMS to customer when imported.

## Design
- Status pills: green=delivered, blue=in transit, amber=pending, red=exception
- Timeline: vertical timeline with carrier scan events
- Map: embedded below timeline on parcel detail
- Analytics: Financial Trust dark palette, recharts

## Execution
1. Read ALL pre-edit files
2. Add auto-detection logic
3. Build analytics tab
4. Build exception flagging
5. Build public tracking page
6. Upgrade `src/app/dashboard/parcel-tracking/page.tsx` — additive only
7. `npx tsc --noEmit` — zero errors
8. `npm run build` — must pass
9. `git add -A && git commit -m "feat: parcel-tracking — AfterShip-level map view, carrier auto-detect, analytics, exception alerts, branded tracking page" && git push`
