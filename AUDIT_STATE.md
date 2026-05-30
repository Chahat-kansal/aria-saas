# Aria OS Audit State

## Last updated
2026-05-31 — Session 2 Batch A complete

## Status
IN PROGRESS — src/app/api/pos/ Batch A complete (ad-campaigns → cart-line-actions)

## Completed sections
- [x] src/app/api/aria/ — all ~47 route files audited
- [x] src/app/api/pos/ Batch A — ad-campaigns, ad-impressions, agent-decisions (3 files), agents/[type], ask, audit-log, balances, bas-export, basket-analysis, business, cafe/seed-modifiers, cart-intelligence, cart-line-actions

## Current position
Next: src/app/api/pos/ Batch B (cash-sessions → customers)

## Issues found (running log)
| File | Type | Issue | Fixed? | Commit |
|------|------|-------|--------|--------|
| src/app/api/aria/daily-briefing/route.ts | Wrong table + column | `reviews.response` doesn't exist; query was from('reviews').is('response', null). Fixed to from('google_reviews').eq('has_reply', false).gte('review_date', ...) | YES | 1ee57b9 |
| src/app/api/aria/page-insight/route.ts | Wrong table + column | Same `reviews.response` bug (unanswered reviews count). Fixed to google_reviews.has_reply | YES | 1ee57b9 |
| src/app/api/aria/page-insight/route.ts | Wrong column | `staff_members.name` doesn't exist; select had `id, name, first_name, last_name, visa_expiry_date`. Fixed select + map to use first_name/last_name | YES | 1ee57b9 |
| src/app/api/aria/page-insight/route.ts | Wrong table | `pos_customers.customer_segment, churn_risk` don't exist on pos_customers. Changed from('pos_customers') → from('customers') | YES | 1ee57b9 |
| src/app/api/aria/roster/route.ts | Wrong column | `staff_members.name` in select caused PostgREST 400, staffRows null, always "No staff found". Removed `name` from select; simplified name-construction line to use first_name/last_name only | YES | af918e0 |
| src/app/api/pos/agents/[type]/route.ts | Wrong column | `pos_staff.active` → `is_active` (in executeScheduleApproval — email to active staff) | YES | ca1cedd6 |
| src/app/api/pos/balances/route.ts | Wrong column | `pos_customers.account_balance` → `balance` (select, gt filter, order, update — 4 occurrences) | YES | ca1cedd6 |

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

## Sections remaining
- [x] src/app/api/aria/ (~47 route files) ← DONE Session 1
- [~] src/app/api/pos/ (~80 route files) — Batch A done, Batch B next (cash-sessions → customers)
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


## COMPLETE TABLE + COLUMN REFERENCE (ground truth from live DB)
Use this to verify every .from('table'), .select('col'), .eq('col'), .insert({col}) call.
If a table or column is NOT in this list, the code is wrong.

### Key tables most commonly called in routes

**businesses**: id, user_id, name, owner_name, industry, address, city, phone, email, staff_count, monthly_revenue, biggest_challenge, google_business_url, google_rating, google_review_count, plan, stripe_customer_id, stripe_subscription_id, trial_ends_at, onboarding_complete, created_at, logo_url, abn, website, is_active, subscription_status, parent_account_id, data_source, square_connected, plan_override_by, plan_override_at, internal_notes, terminal_layout, closing_hour_local, timezone, evening_briefing_lead_hours, evening_briefing_enabled, morning_briefing_enabled, google_place_id, google_average_rating, google_total_reviews, google_reviews_last_synced, enterprise_policies, industry_subtype, **slug** (text UNIQUE), review_auto_request_enabled, review_request_min_spend_cents, review_request_cooldown_days, order_stock_threshold, order_min_sales_30d, business_subtype, display_suggestion_max_pct, review_auto_send, review_send_delay_hours, weekly_report_email, weekly_report_enabled, acn, legal_name, trading_name, entity_type, abn_status, abn_verified, abn_verified_at, abn_verification_method, abn_lookup_raw, gst_registered, gst_registered_from, business_state, postcode, year_established, access_status, access_blocked_reason, business_model, pos_enabled, xero_access_token, xero_refresh_token, xero_tenant_id, xero_connected_at, owner_phone, alert_sms_enabled, lat, lng, suburb, loyalty_points_per_dollar, loyalty_redeem_rate, loyalty_minimum_redeem, loyalty_enabled, facebook_page_id, yelp_url, auto_review_requests, **google_review_link**, **booking_link_slug**, booking_buffer_minutes, default_quote_terms, loyalty_program_name, loyalty_points_name, loyalty_points_expiry_months, weekly_revenue_target, basiq_user_id, basiq_connected, basiq_connected_at, community_verified, community_bio, community_cover_url, **hub_visible_features** (jsonb)

**pos_products**: id, business_id, category_id, supplier_id, name, sku, **barcode** (often NULL — use pos_product_barcodes), description, price, cost_price, tax_rate, stock_quantity, low_stock_threshold, track_stock, **is_active** (boolean), show_online, image_url, created_at, updated_at, brand, family, tags, cases_in_stock, **age_restricted** (boolean), **is_age_restricted** (boolean), category, department, track_inventory, featured, deleted_at

**pos_sales**: id, business_id, session_id, register_id, outlet_id, customer_id, sale_number, subtotal, tax_amount, discount_amount, total_amount, payment_method, cash_tendered, change_given, **status** (filter: != 'voided'), notes, created_at, table_id, age_verified, kds_sent, **served_by** (TEXT — cashier name, NOT a UUID), is_training, order_type, source, sale_completed_at

**pos_sale_items**: id, sale_id, product_id, variant_id, product_name, product_sku, quantity, unit_price, discount_percent, tax_rate, line_total, modifiers, notes, cost_price, margin_percent, business_id, created_at, returned_quantity, price_overridden, original_unit_price, price_override_reason

**staff_members** (NOT pos_staff for team management): id, business_id, first_name, last_name, preferred_name, date_of_birth, position, department, employment_type, start_date, end_date, status, pay_type, pay_rate_cents, pay_per_annum_cents, pay_frequency, superannuation_rate, visa_type, visa_subclass, visa_expiry_date, visa_work_restrictions, notes, created_at, updated_at, user_id, pos_staff_id, portal_enabled, color, hourly_rate. **NO `name` column** (confirmed from migration 20260428000007; pre-existing AUDIT_STATE entry was wrong) — always use first_name + last_name

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

**pos_timesheets**: id, business_id, staff_id, staff_name, clock_in, clock_out, break_minutes, pay_rate_cents, notes, created_at, **staff_member_id** (also has staff_id — check which the code uses), outlet_id, shift_id, total_pay_cents, status, approved, hours_worked

**pos_rosters**: id, business_id, outlet_id, week_start, shifts (jsonb), total_hours, total_cost_cents, published, published_at, generated_by_agent, created_at, status, aria_reasoning, approved_by, updated_at

**pos_roster_templates**: id, business_id, name, week_starting, status, shifts (jsonb), total_hours, total_cost_cents, aria_reasoning, approved_at, published_at, created_at

**community_members**: id, session_token, nickname, push_token, push_enabled, joined_at (NO business_id — community is cross-business)

**community_posts**: id, business_id, post_type, title, body, media_urls, media_type, is_story, expires_at, ai_generated, scheduled_for, published_at, status, created_at, updated_at

**marketplace_listings**: id, business_id, product_id, title, description, price, media_urls, category, status, created_at, updated_at

**marketplace_chats**: id, listing_id, member_id, business_id, messages (jsonb), last_message_at, unread_for_owner, unread_for_member, created_at

**competitor_businesses**: id, business_id, competitor_name, competitor_address, competitor_place_id, distance_m, category, phone, website, google_rating, last_checked, **name** (also has name column)

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

**social_posts**: id, business_id, platform, status, caption, hashtags, image_url, image_prompt, scheduled_for, published_at, platform_post_id, aria_reasoning, industry_context, performance, created_at, approved_at, approval_status

**aria_ai_calls**: id, business_id, agent_key, provider, model_id, role, input_tokens, output_tokens, search_units, latency_ms, cost_usd_cents, success, error_message, request_summary, response_summary, created_at, cache_write_tokens, cache_read_tokens, model_provider

**pos_parcel_tracking**: id, business_id, tracking_number, carrier, carrier_name, label, direction, status, status_detail, origin, destination, estimated_delivery, last_event_at, last_checked_at, delivered_at, events, reference_type, reference_id, notes, created_at, updated_at, recipient_name, recipient_phone, recipient_address, recipient_city, recipient_state, recipient_postcode, order_reference, manual_status, aria_insight, predicted_late, aria_evaluated_at

**customer_hub_clicks**: id, business_id, visitor_id, target, referrer, user_agent, created_at

**instore_conversations**: id, business_id, messages (jsonb), customer_id, email_captured, started_at, ended_at (NO visitor_id — uses customer_id)

**instore_demand_signals**: id, business_id, query_text, product_asked, in_stock, matched_product_id, signal_type, created_at

**pos_product_barcodes**: id, business_id, product_id, barcode, is_primary, barcode_type, notes, created_at

**staff_shifts**: id, business_id, outlet_id, **staff_id** (uuid), start_time, end_time, role, status, notes, created_at, **staff_member_id** (also has staff_member_id), area_id, break_minutes, cost_cents, is_recurring, confirmed_by_staff, ai_generated, updated_at, shift_date, staff_name

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
