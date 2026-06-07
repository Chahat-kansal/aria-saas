/**
 * Schema Truth Registry — single source of truth for canonical data sources.
 * Import this wherever a tool or narrator needs to know which column/table is authoritative.
 * All values verified against live data for business ff5055a0-c351-4ada-817a-1804961035f3.
 */

export interface RegistryEntry {
  domain: string
  description: string
  canonical_table: string
  canonical_column: string
  canonical_query_description: string
  banned_sources: string[]
  caveat: string | null
  completeness_check: string | null
}

export const SCHEMA_REGISTRY: Record<string, RegistryEntry> = {
  customer_spend: {
    domain: 'customer_spend',
    description: 'Total lifetime spend per customer — use for best/top customer ranking',
    canonical_table: 'pos_customers',
    canonical_column: 'total_spent',
    canonical_query_description:
      'SELECT name, total_spent FROM pos_customers WHERE business_id ORDER BY total_spent DESC',
    banned_sources: ['total_spend', 'lifetime_value_cents', 'total_lifetime_spend'],
    caveat: null,
    completeness_check: null,
  },

  customer_count: {
    domain: 'customer_count',
    description: 'Authoritative count of POS customers for this business',
    canonical_table: 'pos_customers',
    canonical_column: 'id (COUNT)',
    canonical_query_description:
      'SELECT COUNT(*) FROM pos_customers WHERE business_id = $bid',
    banned_sources: [
      'customers (CRM table — separate from POS, usually empty)',
      'total_customers from business-data abstraction (may query wrong table)',
    ],
    caveat: null,
    completeness_check: null,
  },

  revenue: {
    domain: 'revenue',
    description: 'Business revenue from POS sales — use SUM(total_amount)',
    canonical_table: 'pos_sales',
    canonical_column: 'total_amount (SUM)',
    canonical_query_description:
      "SELECT SUM(total_amount) FROM pos_sales WHERE business_id AND status = 'completed' (status != 'voided' is also safe)",
    banned_sources: [],
    caveat: null,
    completeness_check: null,
  },

  staff_attribution: {
    domain: 'staff_attribution',
    description: 'Sales attributed to individual staff via pos_sales.served_by',
    canonical_table: 'pos_sales',
    canonical_column: 'served_by',
    canonical_query_description:
      'SELECT served_by, SUM(total_amount) FROM pos_sales WHERE business_id AND served_by IS NOT NULL GROUP BY served_by ORDER BY SUM DESC',
    banned_sources: [],
    caveat:
      'Completeness is typically low (verified ~3% of sales have served_by recorded for the reference business — 56/1783 sales). ' +
      'ALWAYS state "based on the X% of sales with staff recorded" when reporting rankings. ' +
      'Compute the actual percentage live per business: ' +
      'COUNT(served_by IS NOT NULL) / COUNT(*) FROM pos_sales WHERE business_id.',
    completeness_check:
      'SELECT COUNT(*) FILTER (WHERE served_by IS NOT NULL) AS attributed, COUNT(*) AS total FROM pos_sales WHERE business_id',
  },

  products: {
    domain: 'products',
    description: 'Product catalogue — price is the selling price in AUD (never cents)',
    canonical_table: 'pos_products',
    canonical_column: 'price (selling price in AUD), cost_price',
    canonical_query_description:
      'SELECT * FROM pos_products WHERE business_id AND is_active = true',
    banned_sources: ['retail_price', 'selling_price'],
    caveat: null,
    completeness_check: null,
  },

  marketing_consent: {
    domain: 'marketing_consent',
    description: 'Count of POS customers who have consented to marketing — the ONLY safe emailable/textable audience',
    canonical_table: 'pos_customers',
    canonical_column: 'marketing_consent (boolean, COUNT WHERE true)',
    canonical_query_description:
      'SELECT COUNT(*) FROM pos_customers WHERE business_id = $bid AND marketing_consent = true',
    banned_sources: [
      'pos_customer_count (total headcount — includes non-consented)',
      'with_email_count (has email address but may not have consented)',
      'customers (CRM table — no marketing_consent column)',
    ],
    caveat:
      'MANDATORY CAVEAT whenever suggesting an email or SMS campaign: ' +
      '"Only [N] of [total] customers have consented to marketing — your reachable audience is [N], not [total]." ' +
      'Verified ground truth for reference business: 11 of 37 customers consented (~30%). ' +
      'Always compute live per business: COUNT WHERE marketing_consent = true / COUNT(*) from pos_customers.',
    completeness_check:
      'SELECT COUNT(*) FILTER (WHERE marketing_consent = true) AS consented, COUNT(*) AS total FROM pos_customers WHERE business_id = $bid',
  },

  product_stock: {
    domain: 'product_stock',
    description: 'Stock on hand per product — use for low-stock alerts and inventory signals in reel ideas and suggestions',
    canonical_table: 'pos_products',
    canonical_column: 'stock_quantity',
    canonical_query_description:
      'SELECT name, stock_quantity, reorder_point FROM pos_products WHERE business_id AND is_active = true ORDER BY stock_quantity ASC',
    banned_sources: [
      'qty_on_hand (does not exist on pos_products)',
      'stock (does not exist)',
      'pos_outlet_inventory.qty_on_hand (wrong column — RULE 6 says items_on_hand)',
    ],
    caveat:
      'pos_products.stock_quantity is canonical for single-outlet businesses. ' +
      'For multi-outlet businesses use pos_outlet_inventory.items_on_hand per RULE 6. ' +
      'Verified: stock_quantity populated for 74/74 active products on reference business.',
    completeness_check:
      'SELECT COUNT(*) FILTER (WHERE stock_quantity IS NOT NULL) AS populated, COUNT(*) AS total FROM pos_products WHERE business_id = $bid AND is_active = true',
  },

  product_sales: {
    domain: 'product_sales',
    description: 'Per-product unit count and revenue from POS — use line_total (canonical per RULE 6), never unit_price×quantity',
    canonical_table: 'pos_sale_items',
    canonical_column: 'line_total (revenue), quantity (units), product_name',
    canonical_query_description:
      'SELECT product_name, SUM(quantity) AS units, SUM(line_total) AS revenue FROM pos_sale_items WHERE business_id GROUP BY product_name ORDER BY revenue DESC',
    banned_sources: [
      'total_price (wrong column name — RULE 6 bans this)',
      'unit_price * quantity (manual multiplication — introduces rounding drift)',
      'pos_sales.total_amount (sale-level aggregate only, not per-product)',
    ],
    caveat:
      'product_name is a denormalised string in pos_sale_items — may differ from pos_products.name if a product was renamed after sale. ' +
      'Use the sale_items product_name as-is for sales rankings (reflects what was sold at time of sale).',
    completeness_check:
      'SELECT COUNT(DISTINCT product_name) AS distinct_products FROM pos_sale_items WHERE business_id = $bid',
  },

  slow_day: {
    domain: 'slow_day',
    description: 'Day-of-week with the lowest average daily revenue — MUST use daily-bucketing method, not per-transaction count',
    canonical_table: 'pos_sales',
    canonical_column: 'total_amount (day-level revenue only — NOT per-product; use pos_sale_items.line_total for per-product breakdowns)',
    canonical_query_description:
      'Step 1: Group each calendar date → SUM(total_amount) for that day (daily bucket). ' +
      'Step 2: Group calendar dates by DOW (UTC) → AVERAGE of the daily SUM values. ' +
      'Step 3: Rank ascending → lowest average daily revenue = slowest day. ' +
      'Requirements: ≥3 distinct calendar days per DOW; 28-day window (4 of each weekday, always satisfies ≥3); neq(status, voided); limit(3000). ' +
      'DOW: UTC — extract as dateStr.slice(0,10) + "T00:00:00Z" → getUTCDay() to avoid AEST/UTC drift. ' +
      'Implementation: import computeSlowDay from @/lib/aria/slow-day — the single canonical implementation.',
    banned_sources: [
      'COUNT of sales rows per DOW (counts transactions, not revenue — skews toward high-volume-low-value days)',
      'SUM(total_amount) per DOW / COUNT(sales rows) (averages transaction value, not daily revenue)',
      'get_slow_days RPC (unverified stored procedure — may use banned method internally)',
      'pos_sale_items.line_total for slow-day (line_total is per-product only; total_amount is the day-level canonical)',
      'new Date(dateStr).getDay() (returns local system timezone DOW — causes AEST vs UTC mismatch)',
    ],
    caveat:
      'Verified ground truth (reference business ff5055a0, 28-day window): Tuesday = $392.02/day. ' +
      'Cross-checked to the cent against direct SQL aggregation. ' +
      'Always compute live — never hard-code this value for a specific business. ' +
      'Skip any DOW with fewer than 3 distinct calendar days (28d window always satisfies this).',
    completeness_check:
      'SELECT DATE(created_at) AS d, EXTRACT(DOW FROM created_at) AS dow, SUM(total_amount) AS daily_rev ' +
      "FROM pos_sales WHERE business_id = $bid AND status != 'voided' " +
      'GROUP BY d, dow ORDER BY d DESC LIMIT 10',
  },
}

export function getRegistryEntry(domain: string): RegistryEntry | undefined {
  return SCHEMA_REGISTRY[domain]
}

export function getCanonicalColumn(domain: string): string {
  return SCHEMA_REGISTRY[domain]?.canonical_column ?? ''
}

export function getBannedSources(domain: string): string[] {
  return SCHEMA_REGISTRY[domain]?.banned_sources ?? []
}

export function getCaveat(domain: string): string | null {
  return SCHEMA_REGISTRY[domain]?.caveat ?? null
}

/**
 * Canonical column names — import these instead of hard-coding strings.
 * ONE source of truth; update here to propagate everywhere.
 */
export const CANONICAL_COLS = {
  CUSTOMER_SPEND:      'total_spent',
  PRODUCT_REVENUE:     'line_total',
  PRODUCT_UNITS:       'quantity',
  PRODUCT_STOCK:       'stock_quantity',
  PRODUCT_STOCK_MULTI: 'items_on_hand',
  MARKETING_CONSENT:   'marketing_consent',
} as const
