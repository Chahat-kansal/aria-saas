# Aria OS Audit State

## Last updated
2026-05-31 — Prompt-113 ALL 9 TASKS COMPLETE. All commits pushed to origin/main (4971a48a).

## Push Status
ALL COMMITS PUSHED — origin/main is current as of 4971a48a

## Audit Status
COMPLETE — src/app/api/aria/ all ~47 route files audited (Session 1)
COMPLETE — src/app/api/pos/ all ~120 route files audited (Batches A–G, Session 2)
COMPLETE — src/app/api/public/ all ~19 route files audited (Batch A, Session 3)
COMPLETE — src/app/api/social/ all ~31 route files audited (Batch B, Session 3)
COMPLETE — src/app/api/seo/ all ~12 route files audited (Batch C, Session 3)
COMPLETE — src/app/api/reports/ all ~3 route files audited (Batch C, Session 3)
COMPLETE — src/app/api/community/ all ~25 route files audited — all clean (ce9827d5)
COMPLETE — src/app/api/integrations/ audited — all clean (f900ae2c)
COMPLETE — src/app/api/cron/ audited — all clean (f900ae2c)

## Prompt-113 (Ask Aria 110%) Status — ALL DONE
- [x] Task 1: Deep context pre-loaded (top products, customers, loyalty, comparison, avg daily revenue) → 2dc8b3fb
- [x] Task 2: Council personalisation — each brain gets the actual owner question → b7c74c5b
- [x] Task 3: Route handler signatures fixed (NextRequest → Request) → 63a61301
- [x] Task 4: Enforce web search for benchmark questions on Haiku (needsBenchmark pre-search) → 306fe623
- [x] Task 5: Memory integration — surface memories at top of system prompt + auto-write → ac471b93
- [x] Task 6: Technical help capability — debug errors, explain code, write SQL, read Vercel logs → 40537ee4
- [x] Task 7: Long document processing — map-reduce over 100+ page PDFs + large spreadsheets → 60dc6a5b
- [x] Task 8: Full URL fetching — complete page content, tables, links, multi-page navigation → 5846ca76
- [x] Task 9: Deep image analysis — receipts, invoices, products, charts, handwriting + auto-expense → 5846ca76

## Current Position
Prompt-113 COMPLETE. Next prompts available: PRR-1 (API hardening), audit session 5 (frontend/lib), audit session 6 (silent failures/safety).

## Issues found (running log)
| File | Type | Issue | Fixed? | Commit |
|------|------|-------|--------|--------|
| src/app/api/aria/daily-briefing/route.ts | Wrong table + column | `reviews.response` doesn't exist; fixed to `google_reviews.has_reply` | YES | 1ee57b9 |
| src/app/api/aria/page-insight/route.ts | Wrong table + column | Same `reviews.response` bug; fixed to `google_reviews.has_reply` | YES | 1ee57b9 |
| src/app/api/aria/page-insight/route.ts | Wrong column | `staff_members.name` doesn't exist; fixed to use first_name/last_name | YES | 1ee57b9 |
| src/app/api/aria/page-insight/route.ts | Wrong table | `pos_customers.customer_segment, churn_risk` don't exist; changed to `customers` | YES | 1ee57b9 |
| src/app/api/aria/roster/route.ts | Wrong column | `staff_members.name` in select → use first_name/last_name | YES | af918e0 |
| src/app/api/pos/agents/[type]/route.ts | Wrong column | `pos_staff.active` → `is_active` | YES | ca1cedd6 |
| src/app/api/pos/balances/route.ts | Wrong column | `pos_customers.account_balance` → `balance` (4 occurrences) | YES | ca1cedd6 |
| src/app/api/pos/customer-greet/route.ts | Wrong column | `pos_sales.items` → `id` + `pos_products.is_featured` → `featured` | YES | 6c4f4e8e |
| src/app/api/pos/customers/[id]/route.ts | Wrong columns | `pos_sales.points_earned, points_redeemed` removed | YES | dd2988e9 |
| src/app/api/pos/laybys/route.ts | Wrong table join | `customers` → `pos_customers`; added FK | YES | 0630d77c |
| src/app/api/pos/inventory/route.ts | Wrong column | `pos_outlet_inventory.stock_quantity` → `items_on_hand` (4 occurrences) | YES | 12971389 |
| src/app/api/pos/reports/closure/[id]/route.ts | Wrong column | `pos_sale_items.total_price` removed (correct: `line_total`) | YES | 447a71c1 |
| src/app/api/pos/shift-reports/route.ts | Wrong table + column | `pos_timesheet_sessions` → `pos_timesheets`; `total_minutes` → `hours_worked` | YES | 5e694eaf |
| src/app/api/pos/transfer-reports/route.ts | Wrong table + join | `pos_stock_transfers` → `pos_inventory_transfers`; removed invalid join | YES | b1f41112 |
| src/app/api/pos/xero-sync/route.ts | Wrong column | `pos_sales.total` → `total_amount` (2 occurrences) | YES | 3aaaba87 |
| src/app/api/pos/variants/route.ts | Wrong table + join | `pos_product_modifiers` → `pos_product_modifier_groups` | YES | 78338351 |
| src/app/api/public/widget/chat/route.ts | Wrong table + column | `products` → `pos_products`; `suggested_action` → `action_data` | YES | 71e7e496 |
| src/app/api/public/instore/chat/route.ts | Wrong columns | `aria_ai_calls.route/model/purpose/status` → `agent_key/model_id/request_summary/success` | YES | 339e8800 |
| src/app/api/social/analytics/route.ts | Missing columns | `social_posts.impressions/reach/likes/comments/shares` added via migration | YES (migration) | — |
| src/app/api/social/posts/[id]/publish/route.ts | Missing columns | `social_posts.platform_url` and `publish_error` added via migration | YES (migration) | — |
| src/app/api/social/bulk-schedule/route.ts | Wrong column | `scheduled_at` → `scheduled_for` | YES | 7e78ac11 |
| src/app/api/social/owner-request/route.ts | Wrong columns | `image_urls/ai_generated/ai_prompt/post_type` → `image_url` + removed non-existent | YES | 7e78ac11 |
| src/app/api/seo/local/route.ts | Missing columns | `seo_local.gbp_listed/review_count/review_avg/scanned_at` added via migration | YES (migration) | e871aac9 |
| src/app/api/seo/local/scan/route.ts | Missing columns | Same `seo_local` missing columns | YES (migration) | e871aac9 |
| src/app/api/seo/recommendations/route.ts | Missing columns + wrong model | `gbp_listed/review_count/review_avg`; model `claude-sonnet-4-6` → correct ID | YES | e871aac9 |
| src/app/api/seo/generate-fix/route.ts | Wrong columns | `aria_ai_calls.model/prompt_summary/tokens_used/feature` → correct columns | YES | e871aac9 |
| src/components/dashboard/BlockRenderer.tsx | Unclosed try block | TS1472 — try with no catch/finally, broke build | YES | af00d3b3 |
| src/app/api/pos/outlet-transfers/route.ts | Wrong column | `pos_outlet_inventory.qty_on_hand` → `items_on_hand` | YES | 41805ade + 58f224d6 |
| src/lib/pos/kds-fire.ts | Wrong column | `pos_products.kds_skip_routing` doesn't exist — 400 on every KDS fire | YES | 030142e2 + f2b6573d |
| src/lib/aria-tools.ts | Wrong column | `pos_products.retail_price/selling_price` → `price` | YES | 76e0b824 |
| Various aria routes | Wrong handler signature | `NextRequest` → `Request` in withErrorCapture handlers | YES | 63a61301 |

## Known already-fixed issues (do not re-fix)
| File | Issue | Fixed in |
|------|-------|----------|
| src/app/dashboard/social/page.tsx | connections state never loaded | prompt 94 |
| src/app/api/aria/social-suggest/route.ts | hardcoded platforms | prompt 93 |
| src/app/api/public/loyalty/*/route.ts | slug-vs-UUID | prompt 92 |
| src/app/dashboard/staff/page.tsx | roster read pos_staff not staff_members | prompt 88 |
| src/app/api/public/menu/*/route.ts | slug-vs-UUID | prompt 92 |
| src/app/api/public/business/*/route.ts | slug-vs-UUID | prompt 92 |

## Routes confirmed CLEAN in src/app/api/aria/ (Session 1)
ask, autopilot-actions, briefing, bundle-builder, business-brain, competitor-businesses,
competitor-prices, competitor-prices/history, competitor-watches, compliance,
custom-features, daily-briefing (after fix), delivery-prediction, dynamic-pricing,
explain-metric, hypotheses, marketing-campaigns, page-insight (after fix), price-intelligence,
recipe-suggestions, reorder-forecast, review-request, roster (after fix), shift-analysis,
skills, social-suggest, studio, studio/upload, test, weekly-report, winback-compose

## Routes confirmed CLEAN in src/app/api/pos/ Batch A (Session 2)
ad-campaigns, ad-impressions, agent-decisions, agent-decisions/[id]/approve,
agent-decisions/[id]/reject, agents/[type] (after fix), ask, audit-log,
balances (after fix), bas-export, basket-analysis, business, cafe/seed-modifiers,
cart-intelligence, cart-line-actions

## Routes confirmed CLEAN in src/app/api/pos/ Batch B (Session 2)
cash-movements, cash-sessions, cash-sessions/[id], categories, classifications,
commission-rules, commissions, custom-roles, custom-roles/[id],
customer-greet (after fix), customer-groups,
customers, customers/[id] (after fix), customers/lookup, customers/performance,
customers/rfm-trigger, customers/segments, customers/sms-draft, customers/insight,
customers/[id]/activity, customers/sms

## Routes confirmed CLEAN in src/app/api/pos/ Batch C (Session 2)
daily-summary, dashboard, dead-stock, display-suggestions, email-log, email-receipt,
enterprise-policies, eod-markdown, expiry/alerts, expiry/alerts/[id], expiry/batches,
expiry-alerts, fitting-room, future-prices, gift-cards, gift-cards/aria-check,
gift-cards/receipt

## Routes confirmed CLEAN in src/app/api/pos/ Batch D (Session 2)
hardware-devices, hardware-devices/[id], image-credits, image-credits/purchase,
import/barcode-lookup, import/deduplicate, integrations, integrations-status,
inventory, kds, kds/all-day, kds/tickets/[id]/refire, laybys (after fix),
loyalty/redeem, manager-verify, media, migrate/[source], missed-demand,
mobile-session/[id]/submit, modifiers, modifiers/[id]

## Routes confirmed CLEAN in src/app/api/pos/ Batch E (Session 2)
online, orders, orders/[id], orders/receive, orders/schedule, orders/[id]/lines,
orders/[id]/lines/[lineId], outlet-tax-overrides, outlets/[id], park,
permissions/outlet-overlay, price-points, price-tickets, product-batches,
product-intelligence, products/backfill-images, products/[id]/init-inventory,
products/[id]/modifiers, products/[id]/variations

## Routes confirmed CLEAN in src/app/api/pos/ Batch F (Session 2)
promotions, promotions/[id], purchase-orders (2 files), receipts, register-close,
register-open, registers, reports/closure/[id] (after fix),
sale-keys, sales/draft, sales/draft/[sale_id]/promote, sales/draft/[sale_id]/void,
sales/return, sales/[id], sales/[id]/refund, sales/[id]/reopen, sales/[id]/reprint,
sales/[id]/split, sales/[id]/void, sales,
scan-and-go/redeem, scan-and-go/complete,
scheduled-cost-changes, scheduled-price-changes, seed-cafe-products, settings,
sessions, shift-audits,
shift-reports (after fix), shift-reports/staff-hours, shift-reports/payroll-export,
split-groups, split-groups/[id], split-groups/[id]/history, split-groups/[id]/members,
split-groups/[id]/members/[member_id],
split-ious, split-ious/simplify, split-ious/[id], split-ious/[id]/settle,
split-ious/[id]/dispute, split-ious/[id]/resolve-dispute,
splits, splits/[id], splits/[id]/pay, splits/[id]/void, splits/[id]/receipt,
splits/[id]/combine, splits/[id]/reassign-item,
splits/ai-suggest, splits/ai-suggest/confirm,
splits/ocr, splits/ocr/from-scan, splits/ocr/[scan_id],
staff, staff-leave, staff-performance, staff-shifts,
stock/adjust, stock-takes, store-credits, suppliers, suppliers/integrations,
surcharge-rules, sync-offline, timesheets

## Routes confirmed CLEAN in src/app/api/pos/ Batch G (Session 2)
tables, tables/[id], tables/[id]/seat, tables/[id]/clear,
tax-codes, tax-codes/[id], tax-holidays,
timesheets/export, timed-prices,
transfer-reports (after fix), transfers/history, transfers/[id]/items,
transfers/[id]/transition, transfers,
users, users/[id], users/me-permissions, users/verify-pin, users/verify-override,
variant-groups, variant-groups/[id],
variants (after fix), variance-intelligence,
warehouse/replenish,
xero-sync (after fix), xero-sync/prepare, xero-sync/approve,
waste

## Routes confirmed CLEAN in src/app/api/public/ Batch A (Session 3)
order/[id]/status, receipt/[sale_id], widget/embed/[api_key],
widget/chat (after fix), instore/recipe, instore/loyalty, instore/session,
scan-and-go/cart, scan-and-go/finish, loyalty/[business_id],
loyalty/[business_id]/enrol, loyalty/[business_id]/balance,
bookings/[business_id], instore/chat (after fix), instore/config,
business/[business_id], menu/[business_id], menu/[business_id]/descriptions,
place-order/[business_id]

## Routes confirmed CLEAN in src/app/api/reports/ Batch C (Session 3)
revenue/route.ts, customers/route.ts, staff/route.ts

## Routes confirmed CLEAN in src/app/api/seo/ Batch C (Session 3)
crawl/route.ts, issues/[id]/route.ts, apply-fix/route.ts, audit/[id]/status/route.ts,
competitors/route.ts, keywords/route.ts, keywords/[id]/route.ts, connect/route.ts,
local/route.ts (after migration), local/scan/route.ts (after migration),
recommendations/route.ts (after model fix), generate-fix/route.ts (after aria_ai_calls fix)

## Routes confirmed CLEAN in src/app/api/social/ Batch B (Session 3)
posts (after bulk-schedule fix), posts/[id]/publish (after migration),
posts/bulk-approve, connections, connections/[id], approve,
preferences, analytics (after migration), publish, calendar, media,
library, bulk-schedule (after fix), scheduler/analyze, scheduler/best-times,
providers, inbox, image-suggest, owner-request (after fix),
generate-image, generate-video, generate-voiceover, video-status,
data-deletion, callback/google, callback/facebook,
connect/google, connect/facebook, google/connect, google/callback, google/post

## Routes confirmed CLEAN in src/app/api/community/ (Session 3 — ce9827d5)
All ~25 routes confirmed clean — no wrong table/column bugs found

## Routes confirmed CLEAN in src/app/api/integrations/ + cron/ (Session 3 — f900ae2c)
All integrations/ and cron/ routes audited — all clean (per session 3 audit commit)

## Sections remaining
- [x] src/app/api/aria/ (~47 route files) ← DONE
- [x] src/app/api/pos/ (~120 route files) ← DONE
- [x] src/app/api/public/ (~19 route files) ← DONE
- [x] src/app/api/social/ (~31 route files) ← DONE
- [x] src/app/api/reports/ (~3 route files) ← DONE
- [x] src/app/api/seo/ (~12 route files) ← DONE
- [x] src/app/api/community/ (~25 route files) ← DONE
- [x] src/app/api/integrations/ (~15 route files) ← DONE
- [x] src/app/api/cron/ (~15 route files) ← DONE
- [ ] src/app/api/market-prices/ (new)
- [ ] src/app/api/site-preview/ (new)
- [ ] src/app/dashboard/ (all page.tsx — ~50 files)
- [ ] src/app/pos/ (all page.tsx — ~30 files)
- [ ] src/app/in-store/ (all page.tsx — ~8 files)
- [ ] src/lib/aria/ (all lib files — ~30 files)
- [ ] src/components/dashboard/ (all components — ~40 files)

## Total DB tables (341)
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
- staff_members has NO `name` column — always use first_name + last_name
- pos_outlet_inventory uses `items_on_hand` NOT `stock_quantity` or `qty_on_hand`
- pos_sale_items.business_id DOES exist (direct column, no join needed for that field)
- pos_sale_items has NO direct business_id on pos_sales join for products — join via pos_sales!inner(business_id)


## COMPLETE TABLE + COLUMN REFERENCE (ground truth from live DB)
Use this to verify every .from('table'), .select('col'), .eq('col'), .insert({col}) call.
If a table or column is NOT in this list, the code is wrong.

### Key tables most commonly called in routes

**businesses**: id, user_id, name, owner_name, industry, address, city, phone, email, staff_count, monthly_revenue, biggest_challenge, google_business_url, google_rating, google_review_count, plan, stripe_customer_id, stripe_subscription_id, trial_ends_at, onboarding_complete, created_at, logo_url, abn, website, is_active, subscription_status, parent_account_id, data_source, square_connected, plan_override_by, plan_override_at, internal_notes, terminal_layout, closing_hour_local, timezone, evening_briefing_lead_hours, evening_briefing_enabled, morning_briefing_enabled, google_place_id, google_average_rating, google_total_reviews, google_reviews_last_synced, enterprise_policies, industry_subtype, **slug** (text UNIQUE), review_auto_request_enabled, review_request_min_spend_cents, review_request_cooldown_days, order_stock_threshold, order_min_sales_30d, business_subtype, display_suggestion_max_pct, review_auto_send, review_send_delay_hours, weekly_report_email, weekly_report_enabled, acn, legal_name, trading_name, entity_type, abn_status, abn_verified, abn_verified_at, abn_verification_method, abn_lookup_raw, gst_registered, gst_registered_from, business_state, postcode, year_established, access_status, access_blocked_reason, business_model, pos_enabled, xero_access_token, xero_refresh_token, xero_tenant_id, xero_connected_at, owner_phone, alert_sms_enabled, lat, lng, suburb, loyalty_points_per_dollar, loyalty_redeem_rate, loyalty_minimum_redeem, loyalty_enabled, facebook_page_id, yelp_url, auto_review_requests, **google_review_link**, **booking_link_slug**, booking_buffer_minutes, default_quote_terms, loyalty_program_name, loyalty_points_name, loyalty_points_expiry_months, weekly_revenue_target, basiq_user_id, basiq_connected, basiq_connected_at, community_verified, community_bio, community_cover_url, **hub_visible_features** (jsonb)

**pos_products**: id, business_id, category_id, supplier_id, name, sku, **barcode** (often NULL — use pos_product_barcodes), description, price, cost_price, tax_rate, stock_quantity, low_stock_threshold, track_stock, **is_active** (boolean), show_online, image_url, created_at, updated_at, brand, family, tags, cases_in_stock, **age_restricted** (boolean), **is_age_restricted** (boolean), category, department, track_inventory, featured, deleted_at

**pos_sales**: id, business_id, session_id, register_id, outlet_id, customer_id, sale_number, subtotal, tax_amount, discount_amount, total_amount, payment_method, cash_tendered, change_given, **status** (filter: != 'voided'), notes, created_at, table_id, age_verified, kds_sent, **served_by** (TEXT — cashier name, NOT a UUID), is_training, order_type, source, sale_completed_at

**pos_sale_items**: id, sale_id, product_id, variant_id, product_name, product_sku, quantity, unit_price, discount_percent, tax_rate, line_total, modifiers, notes, cost_price, margin_percent, business_id, created_at, returned_quantity, price_overridden, original_unit_price, price_override_reason

**staff_members** (NOT pos_staff for team management): id, business_id, first_name, last_name, preferred_name, date_of_birth, position, department, employment_type, start_date, end_date, status, pay_type, pay_rate_cents, pay_per_annum_cents, pay_frequency, superannuation_rate, visa_type, visa_subclass, visa_expiry_date, visa_work_restrictions, notes, created_at, updated_at, user_id, pos_staff_id, portal_enabled, color, hourly_rate. **NO `name` column** — always use first_name + last_name

**pos_staff** (register login table — NOT team management): id, business_id, name, email, pin, role, is_active, color, permissions, created_at

**pos_customers**: id, business_id, customer_group_id, name, email, phone, loyalty_points, total_spent, visit_count, balance, notes, created_at, loyalty_balance, total_spend, last_visit, group_name, points_balance, stamps_count, last_visit_at, marketing_consent, updated_at, rfm_recency_score, rfm_frequency_score, rfm_monetary_score, segment, days_since_visit, lifetime_value_cents, loyalty_tier, referral_code

**customers** (separate non-POS table): id, business_id, name, phone, email, last_visit, visit_count, total_spend, churn_risk, created_at, rfm_score, rfm_score_numeric, customer_segment, predicted_next_visit, total_spent, address, city, postcode, notes, tags, company, source, ai_summary, archived, updated_at

**social_connections**: id, business_id, platform, platform_account_id, platform_account_name, platform_page_id, instagram_account_id, access_token, token_expires_at, **is_active** (boolean), connected_at, follower_count, last_synced_at, profile_picture, account_handle

**instore_kiosk_configs**: id, business_id, kiosk_name, greeting, personality, voice_enabled, loyalty_enabled, recipe_suggestions, enabled, created_at, tablet_api_key, **scan_and_go_enabled** (boolean)

**instore_kiosk_tokens**: id, business_id, token, active, generated_at, expires_at

**pos_self_checkout_carts**: id, business_id, token, items (jsonb), subtotal_cents, status, customer_session_token, loyalty_customer_id, finished_at, expires_at, redeemed_at, redeemed_sale_id, created_at

**aria_monthly_spend**: id, business_id, year_month, sonnet_cents, haiku_cents, opus_cents, other_cents, total_cents, updated_at

**market_price_scans**: id, business_id, status, products_scanned, prices_found, overpriced_count, underpriced_count, potential_revenue_gain_cents, started_at, finished_at, error_detail, triggered_by

**pos_market_price_cache**: id, product_id, business_id, barcode, source_name, source_url, shelf_price, fetched_at, expires_at, retailer_type, price_gap_cents, price_gap_pct, is_underpriced, is_overpriced, search_query

**pos_loyalty_config**: business_id (PK), program_type, points_per_dollar, point_value_cents, stamps_to_reward, stamp_reward_text, birthday_reward_text, winback_after_days, winback_reward_text, created_at, updated_at, points_expiry_days, referral_bonus_points, referee_bonus_points, **public_enrol_enabled** (boolean), enrol_page_slug, tier_silver_points, tier_gold_points, tier_platinum_points

**business_subscriptions**: id, business_id, stripe_customer_id, stripe_subscription_id, tier, status, trial_ends_at, current_period_start, current_period_end, cancel_at_period_end, cancelled_at, created_at, updated_at, **sonnet_monthly_budget_cents** (integer)

**bookings**: id, business_id, customer_id, customer_name, booking_date, service, **status**, **source**, amount, created_at, booking_time, duration_minutes, party_size, customer_email, customer_phone, notes, reminder_sent_at, confirmed_at, cancelled_at, cancellation_reason, aria_notes, updated_at, service_id, booking_token

**invoices**: id, business_id, customer_id, invoice_number, status, bill_to_name, bill_to_email, bill_to_address, subtotal, gst_total, total, currency, notes, issue_date, due_date, sent_at, paid_at, send_method, pdf_url, ai_generated, created_at, updated_at, viewed_at, auto_reminders

**pos_modifier_groups**: id, business_id, name, required, min_selections, max_selections, applies_to_product_ids, created_at, display_name, selection_type, is_required, allow_quantity, show_conversational_buttons, display_order, color, updated_at

**pos_product_modifier_groups** (join table): id, product_id, group_id, business_id, override_required, override_min, override_max, display_order, created_at

**pos_timesheets**: id, business_id, staff_id, staff_name, clock_in, clock_out, break_minutes, pay_rate_cents, notes, created_at, **staff_member_id**, outlet_id, shift_id, total_pay_cents, status, approved, hours_worked

**pos_rosters**: id, business_id, outlet_id, week_start, shifts (jsonb), total_hours, total_cost_cents, published, published_at, generated_by_agent, created_at, status, aria_reasoning, approved_by, updated_at

**pos_roster_templates**: id, business_id, name, week_starting, status, shifts (jsonb), total_hours, total_cost_cents, aria_reasoning, approved_at, published_at, created_at

**community_members**: id, session_token, nickname, push_token, push_enabled, joined_at (NO business_id — community is cross-business)

**community_posts**: id, business_id, post_type, title, body, media_urls, media_type, is_story, expires_at, ai_generated, scheduled_for, published_at, status, created_at, updated_at

**marketplace_listings**: id, business_id, product_id, title, description, price, media_urls, category, status, created_at, updated_at

**marketplace_chats**: id, listing_id, member_id, business_id, messages (jsonb), last_message_at, unread_for_owner, unread_for_member, created_at

**competitor_businesses**: id, business_id, competitor_name, competitor_address, competitor_place_id, distance_m, category, phone, website, google_rating, last_checked, **name**

**competitor_price_cache**: id, business_id, product_name, competitor_name, competitor_address, competitor_distance_m, **competitor_price_cents** (cents), source, confidence, found_url, searched_at, expires_at

**seo_audits**: id, business_id, health_score, pages_crawled, issues_found, issues_fixed, status, error_detail, started_at, finished_at, created_at, website_url, critical_count, warning_count, info_count

**seo_issues**: id, business_id, audit_id, page_url, issue_type, severity, title, detail, suggested_fix, fix_format, state, applied_at, verified_at, created_at, updated_at, ai_fix_text, affected_url, fixed (boolean)

**seo_pages**: id, business_id, audit_id, url, http_status, title, title_length, meta_description, meta_description_length, h1_count, word_count, images_total, images_missing_alt, has_schema, load_ms, crawled_at, page_size_kb, depth, parent_url

**business_expenses**: id, business_id, **label** (NOT 'name'), **amount** (dollars numeric NOT cents), sort_order, created_at, updated_at

**pos_purchase_orders**: id, business_id, supplier_id, order_number, status, subtotal, tax_amount, total, notes, expected_date, created_at, created_by, source, received_at, received_by, receive_notes

**pos_outlets**: id, business_id, name, address, phone, is_active, created_at, code, timezone, is_global, is_default, active, accepts_online_orders, delivery_enabled, delivery_fee, min_order_amount, prep_time_minutes, stripe_account_id

**pos_registers**: id, outlet_id, business_id, name, is_active, created_at

**pos_cash_sessions**: id, business_id, register_id, outlet_id, opened_by, opened_at, closed_at, opening_float, closing_float, total_cash_sales, total_card_sales, total_refunds, status, actual_cash_cents, expected_cash_cents, variance_cents, closed_by

**daily_briefings**: id, business_id, date, recommendations (jsonb), generated_at, dismissed_at, content, mode, data_snapshot, remind_at

**aria_daily_briefings**: id, business_id, briefing_date, content, generated_at, source

**pos_daily_briefings**: id, business_id, briefing_date, summary, yesterday_revenue, yesterday_transactions, top_products, alerts, insights, generated_at, briefing_type, action_items, pace_vs_average_pct, eod_reconciliation_status

Note: THREE briefing tables exist. Code that reads briefings must use the right one.

**social_posts**: id, business_id, platform, status, caption, hashtags, image_url, image_prompt, scheduled_for, published_at, platform_post_id, aria_reasoning, industry_context, performance, created_at, approved_at, approval_status, engagement_data, media_id, content_calendar_month, approved_by, owner_request, schedule_kind, recurrence_rule, image_credit, reel_concept, reel_script, **impressions**, **reach**, **likes**, **comments**, **shares**, **platform_url**, **publish_error** (last 7 added via migration social_posts_analytics_and_publish_columns)

**seo_local**: business_id (PK), gbp_completeness, map_pack_rank, citations_total, citations_consistent, review_velocity_30d, checklist, updated_at, **gbp_listed** (boolean), **review_count** (integer), **review_avg** (numeric), **scanned_at** (timestamptz) — last 4 added via migration add_missing_seo_local_columns

**aria_ai_calls**: id, business_id, agent_key, provider, model_id, role, input_tokens, output_tokens, search_units, latency_ms, cost_usd_cents, success, error_message, request_summary, response_summary, created_at, cache_write_tokens, cache_read_tokens, model_provider

**pos_parcel_tracking**: id, business_id, tracking_number, carrier, carrier_name, label, direction, status, status_detail, origin, destination, estimated_delivery, last_event_at, last_checked_at, delivered_at, events, reference_type, reference_id, notes, created_at, updated_at, recipient_name, recipient_phone, recipient_address, recipient_city, recipient_state, recipient_postcode, order_reference, manual_status, aria_insight, predicted_late, aria_evaluated_at

**customer_hub_clicks**: id, business_id, visitor_id, target, referrer, user_agent, created_at

**instore_conversations**: id, business_id, messages (jsonb), customer_id, email_captured, started_at, ended_at (NO visitor_id — uses customer_id)

**instore_demand_signals**: id, business_id, query_text, product_asked, in_stock, matched_product_id, signal_type, created_at

**pos_product_barcodes**: id, business_id, product_id, barcode, is_primary, barcode_type, notes, created_at

**staff_shifts**: id, business_id, outlet_id, **staff_id** (uuid), start_time, end_time, role, status, notes, created_at, **staff_member_id**, area_id, break_minutes, cost_cents, is_recurring, confirmed_by_staff, ai_generated, updated_at, shift_date, staff_name

### CRITICAL MONETARY RULE
All amounts stored in the DB as plain dollars (numeric) EXCEPT:
- competitor_price_cents (integer, cents)
- pos_sale_payments.amount_cents (integer, cents)
- Any column explicitly named *_cents (integer, cents)
- Everything else: dollars (numeric)

### THREE BRIEFING TABLES — code must use the right one
1. daily_briefings — original OS briefings (date, recommendations jsonb, content text)
2. aria_daily_briefings — Aria-specific briefings (briefing_date, content text, source)
3. pos_daily_briefings — POS-specific briefings (briefing_date, summary, yesterday_revenue, etc.)