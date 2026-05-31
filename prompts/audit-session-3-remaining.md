# Audit Session 3 — Remaining API Routes

## Scope
All API route files NOT yet audited. Sessions 1 + 2 covered:
- src/app/api/aria/ (Session 1 — complete)
- src/app/api/pos/ (Session 2 — complete)

This session covers everything else:
- src/app/api/public/ (~30 files) — Batch A
- src/app/api/staff/ (~19 dirs) — Batch B
- src/app/api/integrations/ (~14 dirs) — Batch C
- src/app/api/cron/ (~40 dirs) — Batch D
- src/app/api/warehouse/ (~23 dirs) — Batch E
- src/app/api/community/ + social/ (~40 dirs) — Batch F
- src/app/api/loyalty/ + customers/ + seo/ (~30 dirs) — Batch G

## Pre-flight
Read AUDIT_STATE.md first — it contains the full DB schema, column traps, and all bugs found in Sessions 1 + 2.

## Mission
Same as Sessions 1 + 2 — column/table correctness only.
Check every .from(), .select(), .eq(), .insert(), .update() against the live DB schema.
Fix only provably wrong column/table references. No logic changes, no refactors.

## Critical column traps (memorise — these burned us in Sessions 1 + 2)
- staff_members: NO name column → use first_name, last_name
- pos_sales: NO total column → total_amount; status filter != 'voided' not = 'completed'
- pos_sale_items: NO total_price → line_total
- pos_timesheets: use pos_timesheets NOT pos_timesheet_sessions; NO total_minutes → hours_worked
- pos_inventory_transfers: correct table (NOT pos_stock_transfers)
- pos_product_modifier_groups + pos_modifier_groups: correct tables (NOT pos_product_modifiers or pos_modifiers)
- pos_customers: NO customer_segment, churn_risk → those live on customers table
- google_reviews: has has_reply (NOT reviews.response)
- business_expenses: label not name; amount is dollars not cents
- competitor_price_cache.competitor_price_cents: IS cents (exception to dollar rule)
- THREE briefing tables: daily_briefings, aria_daily_briefings, pos_daily_briefings — different columns, never mix
- pos_products NEW columns (added 2026-05-30): shelf_capacity, qty_backroom, expiry_date — VALID, do not flag
- pos_products.barcode: often NULL — real barcodes in pos_product_barcodes
- community_live_streams: uses cf_stream_uid, cf_playback_hls, cf_whip_url (NOT mux_ columns)

## Monetary rule
All DB amounts plain dollars (numeric) EXCEPT columns explicitly named *_cents.
Code that multiplies by 100 before insert or divides by 100 after read = bug.
Exception: staff_members.pay_rate_cents, pay_per_annum_cents ARE cents.

## Batch strategy — work through in order, one batch per sub-session

### Batch A — src/app/api/public/
Dirs: bookings, business, instore, loyalty, menu, order, place-order, receipt, scan-and-go, widget
These are public-facing (no auth). Pay special attention to:
- Table ownership checks (business_id validated via slug/token not user session)
- pos_products joins (barcode, sku, stock_quantity)
- loyalty table references (pos_loyalty_config, pos_loyalty_customers, pos_loyalty_transactions)

### Batch B — src/app/api/staff/
Dirs: [id], announcements, areas, availability, award-rates, documents, invite, leave,
      members, messages, payroll, portal, reports, roster, route.ts, skills, swap, timesheets, workforce-insights
Key traps:
- staff_members: first_name + last_name only, NO name
- pos_timesheets columns: staff_member_id, clock_in, clock_out, hours_worked, break_minutes
- award_rates table if it exists
- staff_leave table columns

### Batch C — src/app/api/integrations/
Dirs: basiq, connect, csv, facebook, google, instagram, kounta, lightspeed-x, lightspeed,
      shopfront, shopify, square, status, xero
Key traps:
- businesses table: xero_access_token, xero_refresh_token, xero_tenant_id, basiq_user_id, basiq_connected
- Square sync: square_catalog_id on pos_products
- Integration status stored in businesses table not a separate table

### Batch D — src/app/api/cron/
Dirs: all 40 cron routes
Key traps:
- These hit many tables — verify every single .from() carefully
- Cron routes often have the most table/column bugs (written fast, rarely tested)
- pos_sales.total_amount (not total)
- staff_members first_name/last_name
- Check all briefing table references (daily_briefings vs aria_daily_briefings vs pos_daily_briefings)
- loyalty tables: pos_loyalty_config, pos_loyalty_customers, pos_loyalty_transactions, pos_loyalty_tiers

### Batch E — src/app/api/warehouse/
Dirs: abc-analysis, assembly, bom, cycle-count, despatch, full-stocktake, grn, item-locations,
      kpis, landed-costs, locations, lots, lpn, pick-allocation, pick-lists, purchase-orders,
      quarantine, returns, serials, stock, suppliers, transfer, uom
Key traps:
- pos_inventory_transfers (not pos_stock_transfers) — already fixed in pos/ but may recur here
- purchase_orders table columns: verify against schema
- supplier table: pos_suppliers or suppliers?
- warehouse location tables: verify names

### Batch F — src/app/api/community/ + src/app/api/social/
Community dirs: businesses, chats, discover, engagement, feed, follows, live, marketplace,
               owner, posts, push, reels, report, saved, search, session, stories, upload-media
Social dirs: analytics, approve, bulk-schedule, calendar, callback, connect, connections,
             data-deletion, generate-image, generate-video, generate-voiceover, google,
             image-suggest, inbox, library, media, owner-request, posts, preferences,
             providers, publish, scheduler, video-status
Key traps:
- community_posts columns: post_type, media_urls (jsonb), media_type, is_story, expires_at, status
- community_live_streams: cf_stream_uid, cf_playback_hls, cf_whip_url, cf_customer_subdomain
- social_posts table columns
- social_connections table columns

### Batch G — src/app/api/loyalty/ + customers/ + seo/
Loyalty dirs: aria-insight, birthday-check, branding, config, customers, earn, fraud,
              redeem, referrals, revenue-forecast, reward-rules, stats, tiers, transactions
Customers dirs: [id], import-map, import-run, import, merge, route.ts, segment, segments, winback
SEO dirs: apply-fix, audit, competitors, connect, crawl, generate-fix, issues, keywords, local, recommendations
Key traps:
- pos_loyalty_config vs loyalty_config — which table?
- pos_loyalty_customers vs loyalty_customers — verify
- customers table: name, phone, email, last_visit, visit_count, total_spend, churn_risk, customer_segment, tags, archived
- pos_customers: different table — loyalty_points, total_spent, visit_count, segment, rfm scores
- seo_issues, seo_pages, seo_keywords, seo_keyword_history columns

## Fix rules
- Fix only wrong column/table — nothing else
- One commit per file fixed: fix(area/route-name): description
- Re-read file after fix to confirm before committing
- npx tsc --noEmit + npm run build before every commit

## Output format per batch
```
BATCH [X] COMPLETE
Audited: [dirs]
Bugs fixed: N
  - file: issue → fix (commit)
Clean: [list]
Next: [batch]
```
Update AUDIT_STATE.md after each batch.

## Start
Begin Batch A: src/app/api/public/
Read each route file, check against AUDIT_STATE.md schema, fix if broken.
