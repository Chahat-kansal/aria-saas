// PROMO-FORM-PARITY-1 — MOVED here from src/app/api/pos/promotions/route.ts, unchanged.
// The move was FORCED, not stylistic: Next.js permits only its own known exports from a route.ts,
// so PROMO_FIELDS could not be exported from there and imported by a test (same constraint that
// forced the extraction in INFRA-INNGEST-1). The route imports it back, so behaviour is identical.
//
// H-17 — this used to spread {...body} straight into the insert/update, so any client-supplied
// key rode along untouched. Explicit allowlist of pos_promotions' real live columns, verified via
// information_schema against prod (the base 20260430000001_pos_promotions.sql CREATE TABLE is
// missing many columns added by later migrations — receipt/waste-elimination/loyalty-offers/
// idempotency-key sprints — so that file alone is not the full picture). 'type' and 'is_active'
// are deliberately excluded: the alias logic below always folds them into promotion_type/active
// and deletes the raw keys, matching this function's pre-existing behaviour.
export const PROMO_FIELDS = [
  'name', 'value', 'min_quantity', 'applies_to', 'category_id', 'product_id',
  'valid_from', 'valid_until', 'active', 'promotion_type', 'product_ids', 'category_ids',
  'buy_quantity', 'get_quantity', 'discount_amount', 'discount_percent', 'bundle_price',
  'min_spend', 'starts_at', 'ends_at', 'notes', 'discount_type', 'active_days',
  'active_hour_start', 'active_hour_end', 'requires_code', 'max_uses_per_day',
  'max_uses_per_customer', 'stacks_with_others', 'stack_priority', 'customer_group_id',
  'min_customer_lifetime_spend', 'min_customer_visits', 'max_total_uses', 'current_uses',
  'exclude_discounted', 'idempotency_key',
  // S-PROMO-RULE-1 — MUST be listed here. PROMO_FIELDS is a strict allowlist applied right
  // before the DB write, so an omitted column is dropped SILENTLY: the owner sets "Cold day,
  // 10°C", the form saves happily, and the rule simply never persists.
  'trigger_type', 'trigger_config',
] as const
