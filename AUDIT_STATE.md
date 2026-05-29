# Aria OS Audit State

## Last updated
Not started yet — run prompt 98 to begin Session 1.

## Status
NOT STARTED

## Completed sections
(none yet)

## Current position
Start at: src/app/api/aria/

## Issues found (running log)
| File | Type | Issue | Fixed? | Commit |
|------|------|-------|--------|--------|

## Known already-fixed issues (do not re-fix)
| File | Issue | Fixed in |
|------|-------|----------|
| src/app/dashboard/social/page.tsx | connections state never loaded | prompt 94 |
| src/app/api/aria/social-suggest/route.ts | hardcoded platforms | prompt 93 |
| src/app/api/public/loyalty/*/route.ts | slug-vs-UUID | prompt 92 |
| src/app/dashboard/staff/page.tsx | roster read pos_staff not staff_members | prompt 88 |
| src/app/api/public/menu/*/route.ts | slug-vs-UUID | prompt 92 |
| src/app/api/public/business/*/route.ts | slug-vs-UUID | prompt 92 |

## Sections remaining
- [ ] src/app/api/aria/ (~47 route files)
- [ ] src/app/api/pos/ (~80 route files)
- [ ] src/app/api/public/ (~30 route files)
- [ ] src/app/api/social/ (~20 route files)
- [ ] src/app/api/reports/ (~10 route files)
- [ ] src/app/api/seo/ (~10 route files)
- [ ] src/app/api/community/ (~25 route files)
- [ ] src/app/api/integrations/ (~15 route files)
- [ ] src/app/api/cron/ (~15 route files)
- [ ] src/app/api/market-prices/ (new)
- [ ] src/app/api/site-preview/ (new)
- [ ] src/app/dashboard/ (all page.tsx — ~50 files)
- [ ] src/app/pos/ (all page.tsx — ~30 files)
- [ ] src/app/in-store/ (all page.tsx — ~8 files)
- [ ] src/lib/aria/ (all lib files — ~30 files)
- [ ] src/components/dashboard/ (all components — ~40 files)

## Total DB tables (341)
(For cross-referencing .from() calls — full list in Supabase)
Key tables: businesses, staff_members, pos_staff, pos_products, pos_sales,
pos_sale_items, pos_customers, customers, pos_purchase_orders, social_connections,
social_posts, community_posts, community_members, instore_conversations,
instore_kiosk_configs, instore_kiosk_tokens, pos_self_checkout_carts,
pos_market_price_cache, market_price_scans, aria_ai_calls, aria_monthly_spend,
daily_briefings, aria_daily_briefings, pos_daily_briefings, bookings,
booking_services, booking_slots, invoices, invoice_line_items, recipes,
recipe_ingredients, staff_shifts, staff_availability, staff_leave, pos_timesheets,
pos_rosters, pos_loyalty_config, pos_loyalty_transactions, competitor_businesses,
competitor_price_cache, aria_competitor_watches, seo_audits, seo_pages,
seo_issues, seo_keywords, business_expenses, pos_parcel_tracking

## Column traps (easily confused)
- pos_sales.served_by = TEXT (name), not UUID
- pos_sales status filter = "!= voided" not "= completed"
- All DB monetary values = DOLLARS (numeric), not cents
- pos_products.barcode often NULL — use pos_product_barcodes table
- businesses.slug DOES exist (added prompt 89)
- businesses.website DOES exist
- instore_kiosk_configs.scan_and_go_enabled DOES exist
