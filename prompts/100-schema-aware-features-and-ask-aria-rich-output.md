# Prompt 100 — Custom features: schema-aware builder + Ask Aria rich output

## Two problems, one prompt

### Problem 1: Custom feature builder hallucinates column names
When an owner asks Aria to build a custom feature, Claude generates a
FeatureConfig JSON without knowing the real DB schema. It guesses column names
like "total" when the real column is "total_amount". The feature is saved,
renders, and shows "No data" forever because the query silently returns nothing.

The fix: inject the real allowed schema into the Claude prompt BEFORE generating
the config. Claude then generates configs that use real column names.

### Problem 2: Ask Aria can only produce fixed block types
Currently Ask Aria returns: text, chart, stat_grid, table, list, callout,
action_card. The owner cannot say "show me this as a heatmap" or "I want a
bar chart in green" or "give me a downloadable spreadsheet." Output type is
fixed by what Aria decides, not what the owner asks for.

The fix: extend the block system with richer output types, and let the Ask Aria
system prompt know exactly what output types are available and when to use each.

---

## TASK 1 — Schema-aware custom feature builder

### Where the feature is built
Find the route that handles "Build it" on /dashboard/custom-features.
It calls Claude to generate a FeatureConfig JSON from the owner's plain-English
request. Read that route — understand how it currently prompts Claude.

### What to inject into the prompt

Before Claude generates the config, fetch the real schema for allowed tables:

```typescript
// src/lib/aria/feature-schema.ts — create this file
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
    }
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
    }
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
    }
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
    }
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
    }
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
    }
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
    }
  },
}

export const FEATURE_SCHEMA_PROMPT = `
You have access to these tables and columns to build custom dashboard features.
ONLY use tables and columns listed here — do not invent table or column names.

${Object.entries(FEATURE_SCHEMA).map(([table, info]) => `
TABLE: ${table}
DESCRIPTION: ${info.description}
COLUMNS:
${Object.entries(info.columns).map(([col, desc]) => `  - ${col}: ${desc}`).join('
')}
`).join('
')}

CRITICAL RULES:
- pos_sales amounts are in DOLLARS (numeric) — use total_amount, not total
- pos_commissions and pos_timesheets amounts are in CENTS (integer) — divide by 100 for display
- For sales by cashier: use pos_sales.served_by (text), NOT a user ID
- For date filtering: always use created_at as the date_field
- pos_sales status: always add filter status != voided when summing revenue
- The "group_sum" type groups by group_field and sums field — both must exist in the table
- The "count_per_customer" type groups by customer_id and customer_name — both must exist
`
```

### How to inject into the build route

In the route that calls Claude to generate FeatureConfig:
```typescript
import { FEATURE_SCHEMA_PROMPT } from '@/lib/aria/feature-schema'

// Add to the system prompt:
const systemPrompt = `You are building a dashboard feature configuration for an
Australian small business POS system. Generate a valid FeatureConfig JSON.

${FEATURE_SCHEMA_PROMPT}

Output ONLY a valid JSON object matching the FeatureConfig type. No explanation.`
```

### Validation AFTER Claude generates the config

Before saving to business_features, validate the generated config:

```typescript
function validateFeatureConfig(config: FeatureConfig): { valid: boolean; error?: string } {
  const allowedTables = new Set(Object.keys(FEATURE_SCHEMA))
  
  const checkQuery = (q: QueryConfig | undefined, label: string) => {
    if (!q) return null
    if (!allowedTables.has(q.table)) {
      return `${label}: table "${q.table}" is not allowed`
    }
    const tableSchema = FEATURE_SCHEMA[q.table as keyof typeof FEATURE_SCHEMA]
    if (q.field && !tableSchema.columns[q.field]) {
      return `${label}: column "${q.field}" does not exist on ${q.table}`
    }
    if (q.group_field && !tableSchema.columns[q.group_field]) {
      return `${label}: group_field "${q.group_field}" does not exist on ${q.table}`
    }
    return null
  }
  
  const errors = [
    checkQuery(config.query, 'query'),
    checkQuery(config.rows, 'rows'),
    checkQuery(config.trackers, 'trackers'),
    checkQuery(config.alerts, 'alerts'),
  ].filter(Boolean)
  
  if (errors.length > 0) return { valid: false, error: errors.join('; ') }
  return { valid: true }
}
```

If validation fails, return the error to the frontend: "Aria couldn't build that
feature — try rephrasing it." and do NOT save to the DB. Log the failure to aria_ai_calls.

### Commit
"feat(custom-features): schema-aware builder — Claude gets real column names, validates before saving"

---

## TASK 2 — Ask Aria: rich output types based on what the owner asks

### Current state
Ask Aria returns a fixed set of block types: chart, stat_grid, table, list,
callout, action_card. The system prompt tells Claude to pick the "right" type.
The owner cannot say "I want a bar chart in green" or "give me this as a
spreadsheet" or "show me a heatmap."

### What to build

#### New block types to add to BlockRenderer

**1. styled_chart** — like chart but accepts explicit style options
```typescript
{
  type: "styled_chart",
  chart_type: "bar" | "line" | "pie" | "area" | "scatter",
  color: string,               // hex or named colour ("green", "#2D5240")
  title: string,
  data: Array<{name: string, value: number}>,
  x_label?: string,
  y_label?: string,
  show_legend?: boolean,
  show_grid?: boolean,
}
```
Render with Recharts. Pass the color directly to the bar/line/area fill.

**2. data_table** — sortable, filterable table (owner asked for "table view")
```typescript
{
  type: "data_table",
  title: string,
  columns: Array<{key: string, label: string, format?: "currency"|"number"|"percent"|"text"|"date"}>,
  rows: Array<Record<string, unknown>>,
  sortable?: boolean,
  downloadable?: boolean,   // shows an "Export CSV" button
}
```
"Export CSV" converts rows to CSV and triggers browser download. No server call.

**3. spreadsheet** — when the owner says "give me a spreadsheet" or "I want to export this"
```typescript
{
  type: "spreadsheet",
  filename: string,          // e.g. "sales-by-cashier-may-2026.csv"
  headers: string[],
  rows: Array<string[]>,
  auto_download?: boolean,   // if true, triggers download immediately on render
}
```
Renders as a preview table + a "Download spreadsheet" button.
On click (or on mount if auto_download), generates a CSV blob and downloads it.

**4. kpi_card** — single big number with context (more visual than stat_grid)
```typescript
{
  type: "kpi_card",
  label: string,
  value: string | number,
  format?: "currency" | "number" | "percent",
  trend?: number,            // positive = up, negative = down
  trend_label?: string,      // "vs last week"
  color?: string,            // accent colour for the card
  icon?: string,             // lucide icon name
}
```

**5. comparison_table** — side-by-side comparison (like "compare this week vs last week")
```typescript
{
  type: "comparison_table",
  title: string,
  left_label: string,        // "This week"
  right_label: string,       // "Last week"
  rows: Array<{metric: string, left: number, right: number, format?: string}>,
  show_delta?: boolean,      // show % change column
}
```

#### Update BlockRenderer.tsx
Add rendering logic for all 5 new block types.
For styled_chart and data_table, reuse Recharts (already installed).
For spreadsheet, use plain browser Blob + URL.createObjectURL — no libraries needed.

#### Update Ask Aria system prompt
In /api/aria/ask/route.ts, add to the system prompt:

```
OUTPUT FORMAT — match the output type to what the owner asks for:

When the owner asks for a "graph", "chart", "visualise", or specifies a chart
type → use "styled_chart" with their preferred chart_type and color if specified.

When the owner asks for a "table", "tabular", "rows", "list of" → use "data_table"
with downloadable: true so they can export it.

When the owner asks for a "spreadsheet", "export", "download", "CSV", "Excel" →
use "spreadsheet" with auto_download: true. This triggers an automatic download.

When the owner asks for "compare", "vs", "this week vs last week" → use
"comparison_table" with the two periods clearly labelled.

When the owner wants a "KPI", "metric", "single number", "dashboard card" →
use "kpi_card" with appropriate format and trend if data supports it.

When the owner specifies a colour ("in green", "red chart", "use our brand
colour") → pass it directly in the color field. Accept hex (#2D5240) or
named colours (green, sage, lime, forest).

You can return MULTIPLE blocks in one response. If an owner asks "show me
top 5 products as a chart AND give me the full table to download", return
both a styled_chart block AND a spreadsheet block.
```

#### Detect output intent in the intent classifier
In src/lib/aria/ask/intent.ts, add output format detection:

```typescript
// Detect if the owner is asking for a specific output format
export function detectOutputFormat(message: string): {
  wants_chart: boolean
  chart_type?: string
  chart_color?: string
  wants_table: boolean
  wants_download: boolean
  wants_comparison: boolean
} {
  const m = message.toLowerCase()
  return {
    wants_chart: /chart|graph|plot|visualis|bar|line|pie|area/.test(m),
    chart_type: m.includes('bar') ? 'bar' : m.includes('line') ? 'line' :
                m.includes('pie') ? 'pie' : m.includes('area') ? 'area' : undefined,
    chart_color: extractColor(m),
    wants_table: /table|tabular|rows|list of|show me all/.test(m),
    wants_download: /spreadsheet|export|download|csv|excel/.test(m),
    wants_comparison: /compare|vs |versus|against|this week vs|vs last/.test(m),
  }
}

function extractColor(m: string): string | undefined {
  const colors: Record<string, string> = {
    green: '#22c55e', red: '#ef4444', blue: '#3b82f6',
    purple: '#a855f7', orange: '#f97316', yellow: '#eab308',
    teal: '#14b8a6', sage: '#7FB897', forest: '#2D5240',
    lime: '#d9f54e', pink: '#ec4899', indigo: '#6366f1',
  }
  for (const [name, hex] of Object.entries(colors)) {
    if (m.includes(name)) return hex
  }
  const hexMatch = m.match(/#[0-9a-f]{6}/i)
  return hexMatch ? hexMatch[0] : undefined
}
```

Pass the detected output format into the Aria prompt so it uses the right
block type from the start rather than guessing.

### Commit
"feat(ask-aria): rich output types — styled_chart, data_table, spreadsheet, kpi_card, comparison_table + intent-based format detection"

---

## What this achieves

After this prompt:

Owner: "Show me top cashiers this week as a bar chart in green"
→ Returns styled_chart {chart_type: "bar", color: "#22c55e", data: [...]}

Owner: "Give me all my sales from last month as a spreadsheet"
→ Returns spreadsheet {auto_download: true, rows: [...]} — file downloads automatically

Owner: "Compare this week vs last week revenue"
→ Returns comparison_table {left_label: "This week", right_label: "Last week", rows: [...]}

Owner: "Show me a table of my top 20 products"
→ Returns data_table {columns: [...], rows: [...], downloadable: true}

Owner: "What's my average basket size?" (no format specified)
→ Returns kpi_card {label: "Average basket", value: "$12.69", format: "currency"}

## Rules
- npx tsc --noEmit + npm run build before each commit
- FEATURE_SCHEMA in src/lib/aria/feature-schema.ts is the single source of truth
  for allowed tables/columns in custom features — never hardcode in the route
- BlockRenderer additions are additive — do not change existing block types
- The spreadsheet download uses browser Blob API — no server call, no library
- color fields accept hex OR named colours — always convert named to hex before
  passing to Recharts
- After all commits: git push origin main

## Priority if limit runs low
1. Task 1 (schema-aware builder) — fixes real broken features, immediate value
2. Task 2 BlockRenderer additions (new block types) — needed for Ask Aria richness
3. Task 2 system prompt update — makes Ask Aria use the new types
4. Task 2 intent detector — polish, nice but not blocking

Finish current commit, push, STOP, report.
