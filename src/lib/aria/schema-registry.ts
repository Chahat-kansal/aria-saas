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
