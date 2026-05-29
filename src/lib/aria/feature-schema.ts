export const FEATURE_SCHEMA = {
  pos_sales: {
    description: 'Every sale/transaction',
    columns: {
      total_amount: 'numeric — total sale value in dollars',
      subtotal: 'numeric — before tax',
      tax_amount: 'numeric — GST collected',
      discount_amount: 'numeric — discount applied',
      payment_method: 'text — cash/card/split',
      served_by: 'text — cashier name (NOT a UUID)',
      status: 'text — filter with != voided',
      created_at: 'timestamptz — use this for date filtering',
      customer_id: 'uuid — nullable',
      order_type: 'text — dine_in/takeaway/delivery',
      cover_count: 'integer — number of diners',
    },
  },
  pos_sale_items: {
    description: 'Individual line items within sales',
    columns: {
      product_name: 'text — the product name',
      product_sku: 'text — SKU',
      quantity: 'integer — units sold',
      unit_price: 'numeric — price per unit in dollars',
      line_total: 'numeric — quantity * unit_price in dollars',
      discount_percent: 'numeric — % discount on this line',
      cost_price: 'numeric — cost per unit in dollars',
      margin_percent: 'numeric — margin on this line',
      created_at: 'timestamptz',
    },
  },
  pos_customers: {
    description: 'Customer records with loyalty and visit data',
    columns: {
      name: 'text — customer full name',
      email: 'text',
      phone: 'text',
      loyalty_points: 'integer — current points balance',
      stamps_count: 'integer — coffee stamp count',
      total_spent: 'numeric — lifetime spend in dollars',
      visit_count: 'integer — total visits',
      last_visit_at: 'timestamptz — last visit timestamp',
      segment: 'text — vip/regular/at_risk/lapsed',
      created_at: 'timestamptz',
    },
  },
  pos_products: {
    description: 'Product catalogue',
    columns: {
      name: 'text — product name',
      sku: 'text',
      price: 'numeric — selling price in dollars',
      cost_price: 'numeric — cost in dollars',
      stock_quantity: 'integer — current stock',
      category: 'text — product category',
      is_active: 'boolean — true if on sale',
      brand: 'text',
      created_at: 'timestamptz',
    },
  },
  staff_members: {
    description: 'Team/staff management records',
    columns: {
      first_name: 'text',
      last_name: 'text',
      name: 'text — full name (also has first_name + last_name)',
      position: 'text — job title',
      employment_type: 'text — full_time/part_time/casual',
      status: 'text — active/inactive',
      pay_rate_cents: 'integer — hourly rate in CENTS',
      hourly_rate: 'numeric — hourly rate in dollars',
      start_date: 'date',
    },
  },
  pos_timesheets: {
    description: 'Clock-in/clock-out records',
    columns: {
      staff_name: 'text — name of staff member',
      clock_in: 'timestamptz',
      clock_out: 'timestamptz',
      hours_worked: 'numeric — hours for this shift',
      total_pay_cents: 'integer — pay for this shift in CENTS',
      status: 'text — approved/pending',
    },
  },
  pos_commissions: {
    description: 'Sales commission records',
    columns: {
      pos_user_name: 'text — cashier name',
      sale_total_cents: 'integer — sale value in CENTS',
      commission_rate: 'numeric — rate as decimal',
      commission_cents: 'integer — commission amount in CENTS',
      status: 'text — pending/paid',
      created_at: 'timestamptz',
    },
  },
} as const

type TableKey = keyof typeof FEATURE_SCHEMA
type ColumnKey<T extends TableKey> = keyof typeof FEATURE_SCHEMA[T]['columns']

export function isAllowedTable(table: string): table is TableKey {
  return table in FEATURE_SCHEMA
}

export function isAllowedColumn(table: TableKey, column: string): boolean {
  return column in FEATURE_SCHEMA[table].columns
}

export const FEATURE_SCHEMA_PROMPT = `
You have access to these tables and columns to build custom dashboard features.
ONLY use tables and columns listed here — do not invent table or column names.

${Object.entries(FEATURE_SCHEMA).map(([table, info]) => `TABLE: ${table}
DESCRIPTION: ${info.description}
COLUMNS:
${Object.entries(info.columns).map(([col, desc]) => `  - ${col}: ${desc}`).join('\n')}`).join('\n\n')}

CRITICAL RULES:
- pos_sales amounts are in DOLLARS (numeric) — use total_amount, not total
- pos_commissions and pos_timesheets amounts are in CENTS (integer) — divide by 100 for display
- For sales by cashier: use pos_sales.served_by (text), NOT a user ID
- For date filtering: always use created_at as the date_field
- pos_sales status: always add filter status != voided when summing revenue
- The "group_sum" type groups by group_field and sums field — both must exist in the table
- The "count_per_customer" type groups by customer_id and customer_name — both must exist
`

export interface QueryConfig {
  table: string
  type: string
  field?: string
  group_field?: string
  date_field?: string
  date_range?: string
  filters?: unknown
  limit?: number
}

export interface FeatureConfig {
  feature_name: string
  feature_type: string
  description?: string
  location?: string
  display_order?: number
  preview_description?: string
  config: {
    query?: QueryConfig
    rows?: QueryConfig
    trackers?: QueryConfig
    alerts?: QueryConfig
    [key: string]: unknown
  }
}

export function validateFeatureConfig(config: FeatureConfig): { valid: boolean; error?: string } {
  const allowedTables = new Set(Object.keys(FEATURE_SCHEMA))

  function checkQuery(q: QueryConfig | undefined, label: string): string | null {
    if (!q) return null
    if (!allowedTables.has(q.table)) return `${label}: table "${q.table}" is not allowed`
    const tableSchema = FEATURE_SCHEMA[q.table as TableKey]
    if (q.field && !(q.field as string).split(',').every(f => f.trim() === '*' || isAllowedColumn(q.table as TableKey, f.trim()))) {
      return `${label}: field "${q.field}" does not exist on ${q.table}`
    }
    if (q.group_field && !isAllowedColumn(q.table as TableKey, q.group_field)) {
      return `${label}: group_field "${q.group_field}" does not exist on ${q.table}`
    }
    return null
  }

  const errors = [
    checkQuery(config.config?.query, 'query'),
    checkQuery(config.config?.rows, 'rows'),
    checkQuery(config.config?.trackers, 'trackers'),
    checkQuery(config.config?.alerts, 'alerts'),
  ].filter(Boolean) as string[]

  if (errors.length > 0) return { valid: false, error: errors.join('; ') }
  return { valid: true }
}
