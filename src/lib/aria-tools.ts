import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import { sendSMS } from '@/lib/clicksend'
import { supabaseAdmin } from '@/lib/supabase-admin';
import { todayAEST, toAESTStart, startOfWeekAEST } from '@/lib/date-au';
import * as XLSX from 'xlsx';
import { randomUUID } from 'crypto';

export const ARIA_POS_TOOLS: Tool[] = [
  {
    name: 'query_sales',
    description: 'Fetch and group sales data from pos_sales for a date range.',
    input_schema: {
      type: 'object',
      properties: {
        date_from: { type: 'string', description: 'ISO date string YYYY-MM-DD' },
        date_to: { type: 'string', description: 'ISO date string YYYY-MM-DD' },
        group_by: {
          type: 'string',
          enum: ['day', 'week', 'month', 'product', 'cashier', 'payment_method', 'day_of_week'],
          description: 'Use day_of_week to get normalized average revenue per day-of-week name (Monday, Tuesday, etc.). This is the correct option for "busiest day" or "slowest day" questions — it normalizes by how many of each weekday occurred in the period, not raw totals.',
        },
        limit: { type: 'number' },
      },
      required: ['date_from', 'date_to'],
    },
  },
  {
    name: 'query_inventory',
    description: 'Fetch inventory data from pos_products. Supports low-stock and dead-stock filters.',
    input_schema: {
      type: 'object',
      properties: {
        low_stock_only: { type: 'boolean' },
        dead_stock_only: { type: 'boolean' },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'query_customers',
    description: 'Fetch customer data from pos_customers with optional segment, sort, and search.',
    input_schema: {
      type: 'object',
      properties: {
        segment: { type: 'string' },
        sort_by: { type: 'string', enum: ['ltv', 'recency', 'frequency'] },
        limit: { type: 'number' },
        search: { type: 'string' },
      },
    },
  },
  {
    name: 'compare_periods',
    description: 'Compare a metric across two date periods and return percent change.',
    input_schema: {
      type: 'object',
      properties: {
        metric: { type: 'string', enum: ['revenue', 'transactions', 'avg_order'] },
        period_a: {
          type: 'object',
          properties: { from: { type: 'string' }, to: { type: 'string' } },
          required: ['from', 'to'],
        },
        period_b: {
          type: 'object',
          properties: { from: { type: 'string' }, to: { type: 'string' } },
          required: ['from', 'to'],
        },
      },
      required: ['metric', 'period_a', 'period_b'],
    },
  },
  {
    name: 'generate_chart',
    description: 'Generate a chart specification for the visualisation canvas.',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['line', 'bar', 'area', 'pie', 'stacked-bar'] },
        data: { type: 'array', items: { type: 'object' } },
        x_field: { type: 'string' },
        y_field: { type: 'string' },
        series_field: { type: 'string' },
        title: { type: 'string' },
      },
      required: ['type', 'data', 'x_field', 'y_field', 'title'],
    },
  },
  {
    name: 'query_bookings',
    description: 'Query booking data — count, no-show rate, busiest days, upcoming bookings for a time period.',
    input_schema: {
      type: 'object',
      properties: {
        period: { type: 'string', enum: ['today', 'week', 'month'], description: 'Time period' },
      },
      required: ['period'],
    },
  },
  {
    // I7 TOOL-USE — read-only calendar: trading hours + upcoming bookings + staff on leave.
    name: 'query_calendar',
    description: 'Look ahead at the schedule: trading hours, upcoming bookings, and staff on leave over the next N days. Read-only. Use when the owner asks "what\'s coming up", who is rostered/away, or whether they\'re open on a day.',
    input_schema: {
      type: 'object',
      properties: {
        days_ahead: { type: 'integer', minimum: 1, maximum: 90, description: 'How many days ahead to look (default 14).' },
      },
    },
  },
  {
    // I11 COUNTERFACTUAL — live "what if" simulation grounded in this business's real 30-day data.
    name: 'counterfactual_simulate',
    description: 'Run a live "what if" simulation for a SPECIFIC action the owner is weighing (e.g. "what would happen if I ran a Tuesday lunch bundle", "should I raise coffee prices 5%", "what if I opened an hour earlier"). Returns a grounded prediction: predicted dollar impact, confidence, and risk, and saves it as a testable hypothesis. Use ONLY for concrete hypothetical / should-I / what-would-happen questions about an action.',
    input_schema: {
      type: 'object',
      properties: {
        scenario: { type: 'string', description: 'The concrete action/scenario to simulate, in plain language (e.g. "introduce a $12 Tuesday lunch bundle").' },
      },
      required: ['scenario'],
    },
  },
  {
    name: 'query_online_orders',
    description: 'Query online order data — count, revenue, fulfilment type, avg order value for a time period.',
    input_schema: {
      type: 'object',
      properties: {
        period: { type: 'string', enum: ['today', 'week', 'month'], description: 'Time period' },
        status: { type: 'string', description: 'Filter by status (pending/completed/all)' },
      },
      required: ['period'],
    },
  },
  {
    name: 'suggest_promotion',
    description: 'Generate a promotion rule TEMPLATE for review — does NOT save to the database. Use this to show the owner what a promotion would look like. If they want to actually create it, the Act on it button handles the real write.',
    input_schema: {
      type: 'object',
      properties: {
        goal: { type: 'string', enum: ['clear-stock', 'boost-margin', 'attract-new', 'retain-loyal'] },
        constraints: { type: 'string' },
      },
      required: ['goal'],
    },
  },
  {
    name: 'query_business_data',
    description: `Query the business database for any entity. Returns up-to-date rows.

Available entities and their REAL column names:
- products: id, name, sku, barcode, price (selling price in AUD), cost_price, stock_quantity, current_stock, category, brand, is_active, description
- sales: id, total_amount, payment_method, created_at, status, customer_id, customer_name, sale_number, subtotal, tax_total, discount_total
- customers: id, name, phone, email, total_spent (canonical spend column — ORDER BY total_spent DESC for best customers), visit_count, last_visit, loyalty_points, segment
- staff: id, first_name, last_name, position, department, employment_type, pay_rate_cents (cents), status
- suppliers: id, name, contact_name, email, phone, address, notes
- reviews: id, reviewer_name, rating, comment, review_date, has_reply, sentiment
- inventory: id, item_id, movement_type, quantity_added, new_stock, notes, scanned_at
- actions: id, title, category, priority, status, recommendation, expected_impact

IMPORTANT FILTERS supported:
- {since: "2025-01-01"} / {until: "2025-12-31"} — date range
- {name_starts_with: "z"} — name starts with single letter/string
- {name_starts_with_any: ["x", "z"]} — name starts with ANY of these (use for "products starting with X and Z")
- {name_contains: "coffee"} — name contains substring
- {category: "drinks"} / {status: "active"} — exact match on any column

NEVER give up on column errors — system will auto-fall-back. Just try the query.
Returns max 200 rows. For larger exports use generate_report.`,
    input_schema: {
      type: 'object',
      properties: {
        entity: { type: 'string', enum: ['sales', 'products', 'customers', 'staff', 'suppliers', 'reviews', 'inventory', 'actions'] },
        filters: { type: 'object', description: 'Filter criteria. See description for available filter keys.' },
        order_by: { type: 'string', description: 'Column to sort by (use real column names)' },
        order_direction: { type: 'string', enum: ['asc', 'desc'] },
        limit: { type: 'number', description: 'Max 200' },
      },
      required: ['entity'],
    },
  },
  {
    name: 'generate_report',
    description: `Create a downloadable Excel (.xlsx) or CSV file. Use whenever the user wants "in excel", "as a report", "export", "create a file", "csv", "download".

Use the SAME entity names and filters as query_business_data. For products use column "price" (not selling_price).
Columns parameter selects which columns appear in the export.

Example: "csv of products starting with X and Z with selling price":
{title: "Products X-Z", entity: "products", columns: ["name", "sku", "price"], filters: {name_starts_with_any: ["x", "z"]}}

NEVER refuse on schema errors — system has self-healing fallback.`,
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Report title and filename' },
        entity: { type: 'string', enum: ['sales', 'products', 'customers', 'staff', 'suppliers', 'reviews', 'inventory'] },
        columns: { type: 'array', items: { type: 'string' }, description: 'Real column names (e.g. ["name", "price", "cost_price"])' },
        filters: { type: 'object', description: 'Same filters as query_business_data — supports name_starts_with_any: ["x","z"]' },
        order_by: { type: 'string' },
        limit: { type: 'number', description: 'Max 10000' },
        format: { type: 'string', enum: ['xlsx', 'csv'] },
      },
      required: ['title', 'entity'],
    },
  },
  {
    name: 'fetch_url',
    description: 'Fetch the FULL content of any web page. Use after web_search to read a specific result in depth, or when the user gives a URL. Returns full text, not just a snippet.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Full URL including https://' },
        extract: { type: 'string', enum: ['full_text', 'main_content', 'links', 'tables'], description: 'What to extract: full_text = entire page, main_content = first 8000 chars (default), links = all URLs on page, tables = table data only' },
      },
      required: ['url'],
    },
  },
  {
    name: 'web_search',
    description: 'Search the live web for current market data, competitor pricing, industry benchmarks, news, regulations, or any external information. Use for: industry average revenue/margins, competitor prices, Fair Work award rates, current events, market trends, pricing comparisons, any benchmarking question. Returns up to 5 results each with title, URL, and snippet — cite EACH fact inline as [Source: Title](URL). Use search_depth "advanced" for deep research, "basic" for quick facts. DO NOT use web_search for questions about this business\'s own data — use query_business_data or query_sales for that.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query — be specific, include location and year if relevant (e.g. "cafe average revenue Melbourne 2025")' },
        search_depth: { type: 'string', enum: ['basic', 'advanced'], description: 'basic = fast/quick facts (default), advanced = deeper research for complex questions' },
      },
      required: ['query'],
    },
  },
  {
    name: 'send_email_now',
    description: 'Send an email via Resend. Use ONLY when user explicitly says "send an email" or "email X". Always confirm recipient first.',
    input_schema: {
      type: 'object',
      properties: {
        to: { type: 'string' },
        subject: { type: 'string' },
        body: { type: 'string', description: 'HTML body' },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  {
    name: 'send_sms_now',
    description: 'Send an SMS via Twilio. Use ONLY when user explicitly asks. Australian numbers (0412... or +61412...).',
    input_schema: {
      type: 'object',
      properties: {
        to: { type: 'string' },
        message: { type: 'string' },
      },
      required: ['to', 'message'],
    },
  },
  {
    name: 'update_product_price',
    description: 'Change the selling price of a product. Use only when user explicitly asks to change price.',
    input_schema: {
      type: 'object',
      properties: {
        product_id: { type: 'string' },
        new_price: { type: 'number', description: 'New price in dollars' },
      },
      required: ['product_id', 'new_price'],
    },
  },
  {
    name: 'generate_image',
    description: 'Generate an image from a text description using DALL-E 3. Use for: posters, social media graphics, "Now Open" signs, menu illustrations, product mockups, marketing visuals. Returns a download URL. Costs ~$0.04 per image — use only when user explicitly asks for an image.',
    input_schema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Detailed description of the image to generate. Be specific about style, mood, colours, composition.' },
        size: { type: 'string', enum: ['1024x1024', '1792x1024', '1024x1792'], description: 'Image dimensions. Square for social, landscape for headers, portrait for posters.' },
        style: { type: 'string', enum: ['vivid', 'natural'], description: 'vivid = hyper-realistic dramatic, natural = more subtle realistic. Default vivid.' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'run_calculation',
    description: 'Run a precise mathematical calculation using mathjs. Use for: compound interest, percentages, GST calculations, profit margins, currency conversion, statistical analysis. Returns exact numerical answer.',
    input_schema: {
      type: 'object',
      properties: {
        expression: { type: 'string', description: 'Math expression. Examples: "50000 * (1.052)^7", "1250 * 0.10", "(85 - 32) / 32 * 100" for percentage change, "mean([12, 18, 24, 30])" for stats' },
        explanation: { type: 'string', description: 'Brief description of what is being calculated' },
      },
      required: ['expression'],
    },
  },
  {
    name: 'generate_pdf',
    description: 'Create a downloadable PDF document from structured content (reports, invoices, contracts, agreements). Returns download URL. Use when user asks for "as PDF", "PDF report", or formal documents.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        sections: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              heading: { type: 'string' },
              content: { type: 'string', description: 'Markdown-formatted content' },
            },
          },
          description: 'Array of sections, each with a heading and markdown content',
        },
      },
      required: ['title', 'sections'],
    },
  },
  {
    name: 'get_hourly_sales',
    description: 'Get total sales grouped by hour of day and day of week — for heatmaps and time analysis. Returns a 2D grid of revenue totals.',
    input_schema: {
      type: 'object',
      properties: {
        date_range: { type: 'string', enum: ['last_7_days', 'last_30_days', 'this_month', 'last_month'], description: 'The time window to analyse' },
      },
      required: ['date_range'],
    },
  },
  {
    name: 'get_product_sales_detail',
    description: 'Get sales quantity and revenue for every product — for charts and comparisons. Returns each product with total units sold and total revenue.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max products to return (default 20)' },
        date_range: { type: 'string', enum: ['last_7_days', 'last_30_days', 'this_month', 'last_month'], description: 'The time window' },
      },
    },
  },
  {
    name: 'get_cashier_performance',
    description: 'Get sales and metrics per cashier — for leaderboards and comparisons. Returns each cashier with total sales, transaction count, and avg basket.',
    input_schema: {
      type: 'object',
      properties: {
        date_range: { type: 'string', enum: ['last_7_days', 'last_30_days', 'this_month', 'last_month'], description: 'The time window' },
      },
    },
  },
  {
    name: 'query_bank_balance',
    description: 'Get real Australian bank balances and recent transactions via Basiq. Use when owner asks about cash balance, available money, recent large transactions, income vs expenses, or runway. Returns {connected:false} if Basiq is not set up — do not call if owner has not linked their bank.',
    input_schema: {
      type: 'object',
      properties: {
        metric: { type: 'string', enum: ['balance', 'transactions', 'summary', 'cashflow'], description: 'balance = total + per account, transactions = last 10, summary = month income/expenses/net, cashflow = top expense categories' },
      },
      required: ['metric'],
    },
  },
  {
    name: 'save_extracted_receipt',
    description: 'After analysing a receipt or invoice image, save it as a business expense. Use immediately after extracting receipt data from an image to save the owner time.',
    input_schema: {
      type: 'object',
      properties: {
        vendor: { type: 'string', description: 'Vendor/supplier name from the receipt' },
        total: { type: 'number', description: 'Total amount in dollars (not cents)' },
        date: { type: 'string', description: 'Date of the receipt (YYYY-MM-DD)' },
        category: { type: 'string', description: 'Expense category (e.g. supplies, food, equipment, utilities)' },
        line_items: { type: 'array', items: { type: 'object' }, description: 'Individual line items if visible' },
      },
      required: ['vendor', 'total', 'date'],
    },
  },
  {
    name: 'get_business_profile',
    description: 'Get this business\'s profile: name, location, hours, contact, rating. ALWAYS call this first if the user asks about location, address, suburb, city, hours, phone, or any business detail. Returns null_fields listing fields NOT set — NEVER guess or invent values for null fields.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_top',
    description: 'SQL-computed ranked list for a subject. Use for "best", "top", "most popular", "highest-spending" questions. For staff: if served_by data is absent returns {available:false} — tell the user, never guess names.',
    input_schema: {
      type: 'object',
      properties: {
        subject: { type: 'string', enum: ['products', 'customers', 'staff', 'payment_methods', 'categories'], description: 'What to rank' },
        period: { type: 'string', enum: ['today', '7d', '30d', 'month', '90d', 'year'], description: 'Time period' },
        limit: { type: 'number', description: 'How many to return (default 5)' },
      },
      required: ['subject', 'period'],
    },
  },
  {
    name: 'get_summary',
    description: 'Business performance summary for a period: total revenue, sale count, average ticket, unique customers. Use for overview or "how did we do" questions.',
    input_schema: {
      type: 'object',
      properties: {
        period: { type: 'string', enum: ['today', '7d', '30d', 'month', '90d', 'year'], description: 'Time period' },
      },
      required: ['period'],
    },
  },
  {
    name: 'get_reviews',
    description: 'Customer review data: count, average rating, unanswered count, breakdown by rating and platform, recent snippets. Use for reputation or review questions.',
    input_schema: {
      type: 'object',
      properties: {
        period: { type: 'string', enum: ['today', '7d', '30d', 'month', '90d', 'year'], description: 'Time period' },
      },
      required: ['period'],
    },
  },
  {
    name: 'get_profit_leaks',
    description: 'Identified profit leaks for this business with monthly loss amounts and recommendations. Use for "where am I losing money" or profit leak questions.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
];

function getWeekKey(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return monday.toISOString().slice(0, 10);
}

function getMonthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

function getPeriodStart(period: string): string {
  const now = new Date();
  switch (period) {
    case 'today': return toAESTStart(todayAEST()); // TZ-1: AEST midnight
    case '7d': return new Date(now.getTime() - 7 * 86400000).toISOString();
    case '30d': return new Date(now.getTime() - 30 * 86400000).toISOString();
    case 'month': return toAESTStart(todayAEST().slice(0, 7) + '-01'); // TZ-1: AEST month start
    case '90d': return new Date(now.getTime() - 90 * 86400000).toISOString();
    case 'year': return new Date(now.getFullYear(), 0, 1).toISOString();
    default: return new Date(now.getTime() - 30 * 86400000).toISOString();
  }
}

async function querySales(
  input: {
    date_from: string;
    date_to: string;
    group_by?: string;
    limit?: number;
  },
  businessId: string
): Promise<unknown> {
  const supabase = supabaseAdmin;
  const { data: sales } = await supabase
    .from('pos_sales')
    .select('id, total_amount, payment_method, served_by, created_at, status')
    .eq('business_id', businessId)
    // I7 TOOL-USE revenue rule: completed sales only (dollars). 'completed' is a strict subset of
    // non-voided that also excludes refunded — a refunded sale must NOT count as revenue. Matches the
    // WIRE-4 P&L convention. (CLAUDE.md RULE 6's `!= voided` is the looser anti-void guard.)
    .eq('status', 'completed')
    .gte('created_at', `${input.date_from}T00:00:00`)
    .lte('created_at', `${input.date_to}T23:59:59`)
    .order('created_at');

  const rows = sales ?? [];

  if (input.group_by === 'product') {
    const saleIds = rows.map(r => r.id);
    if (saleIds.length === 0) {
      return { rows: [], total_revenue: 0, total_transactions: 0 };
    }
    const { data: items } = await supabase
      .from('pos_sale_items')
      .select('product_id, product_name, quantity, unit_price, sale_id')
      .in('sale_id', saleIds);

    const grouped: Record<string, { product_id: string; product_name: string; quantity: number; revenue: number }> = {};
    for (const item of items ?? []) {
      const key = item.product_id ?? item.product_name ?? 'unknown';
      if (!grouped[key]) {
        grouped[key] = { product_id: item.product_id, product_name: item.product_name, quantity: 0, revenue: 0 };
      }
      grouped[key].quantity += item.quantity ?? 0;
      grouped[key].revenue += (item.quantity ?? 0) * (item.unit_price ?? 0);
    }
    const productRows = Object.values(grouped).sort((a, b) => b.revenue - a.revenue);
    const limited = input.limit ? productRows.slice(0, input.limit) : productRows;
    return {
      rows: limited,
      total_revenue: (Array.isArray(rows) ? rows : []).reduce((s: number, r: {total_amount?: number|null}) => s + (r.total_amount ?? 0), 0),
      total_transactions: Array.isArray(rows) ? rows.length : 0,
    };
  }

  // day_of_week: normalize by number of occurrences so 6-Fridays vs 5-Sundays is fair
  if (input.group_by === 'day_of_week') {
    const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const dowMap: Record<string, { revenue: number; transactions: number; dates: Set<string> }> = {};
    for (const row of rows) {
      const dayName = DAYS[new Date(row.created_at).getDay()];
      const dateStr = row.created_at.slice(0, 10);
      if (!dowMap[dayName]) dowMap[dayName] = { revenue: 0, transactions: 0, dates: new Set() };
      dowMap[dayName].revenue += row.total_amount ?? 0;
      dowMap[dayName].transactions += 1;
      dowMap[dayName].dates.add(dateStr);
    }
    const dowRows = Object.entries(dowMap).map(([day, v]) => ({
      key: day,
      total_revenue: Math.round(v.revenue * 100) / 100,
      transactions: v.transactions,
      day_count: v.dates.size,
      avg_revenue_per_day: v.dates.size > 0 ? Math.round((v.revenue / v.dates.size) * 100) / 100 : 0,
    })).sort((a, b) => b.avg_revenue_per_day - a.avg_revenue_per_day);
    return {
      rows: dowRows,
      note: 'avg_revenue_per_day is normalized by how many of that weekday occurred in the period — use this value for ranking, not total_revenue.',
      total_revenue: (Array.isArray(rows) ? rows : []).reduce((s: number, r: {total_amount?: number|null}) => s + (r.total_amount ?? 0), 0),
      total_transactions: Array.isArray(rows) ? rows.length : 0,
    };
  }

  const grouped: Record<string, { key: string; revenue: number; transactions: number }> = {};
  for (const row of rows) {
    let key: string;
    if (input.group_by === 'day') key = row.created_at.slice(0, 10);
    else if (input.group_by === 'week') key = getWeekKey(row.created_at.slice(0, 10));
    else if (input.group_by === 'month') key = getMonthKey(row.created_at);
    else if (input.group_by === 'cashier') key = row.served_by ?? 'unknown';
    else if (input.group_by === 'payment_method') key = row.payment_method ?? 'unknown';
    else key = row.created_at.slice(0, 10);

    if (!grouped[key]) grouped[key] = { key, revenue: 0, transactions: 0 };
    grouped[key].revenue += row.total_amount ?? 0;
    grouped[key].transactions += 1;
  }

  const result = Object.values(grouped).sort((a, b) => a.key.localeCompare(b.key));
  const limited = input.limit ? result.slice(0, input.limit) : result;

  return {
    rows: limited,
    total_revenue: (Array.isArray(rows) ? rows : []).reduce((s: number, r: {total_amount?: number|null}) => s + (r.total_amount ?? 0), 0),
    total_transactions: Array.isArray(rows) ? rows.length : 0,
  };
}

async function queryInventory(
  input: { low_stock_only?: boolean; dead_stock_only?: boolean; limit?: number },
  businessId: string
): Promise<unknown> {
  const supabase = supabaseAdmin;
  const query = supabase
    .from('pos_products')
    .select('id, name, sku, stock_quantity, reorder_point, cost_price, price, category')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .eq('track_stock', true);

  const { data: products } = await query.order('stock_quantity').limit(input.limit ?? 200);
  const rows = products ?? [];

  let filtered = rows;

  if (input.low_stock_only) {
    filtered = rows.filter(p => (p.stock_quantity ?? 0) <= (p.reorder_point ?? 0));
  }

  if (input.dead_stock_only) {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const productIds = rows.map(p => p.id);
    if (productIds.length > 0) {
      const { data: recentItems } = await supabase
        .from('pos_sale_items')
        .select('product_id')
        .in('product_id', productIds)
        .gte('created_at', cutoff);
      const activeSet = new Set((recentItems ?? []).map(i => i.product_id));
      filtered = rows.filter(p => !activeSet.has(p.id));
    }
  }

  const limited = input.limit ? filtered.slice(0, input.limit) : filtered;
  return { products: limited, count: limited.length };
}

async function queryCustomers(
  input: { segment?: string; sort_by?: string; limit?: number; search?: string },
  businessId: string
): Promise<unknown> {
  const supabase = supabaseAdmin;
  let query = supabase
    .from('pos_customers')
    .select('id, name, email, phone, total_spent, last_visit_at, last_visit, visit_count, segment, rfm_score_total, days_since_visit, created_at')
    .eq('business_id', businessId);

  if (input.segment) query = query.eq('segment', input.segment);
  if (input.search) {
    query = query.or(
      `name.ilike.%${input.search}%,email.ilike.%${input.search}%,phone.ilike.%${input.search}%`
    );
  }

  const sortCol =
    input.sort_by === 'ltv' ? 'total_spent' :
    input.sort_by === 'recency' ? 'last_visit_at' :
    input.sort_by === 'frequency' ? 'visit_count' :
    'rfm_score_total';

  const { data: customers } = await query
    .order(sortCol, { ascending: false })
    .limit(input.limit ?? 50);

  return { customers: customers ?? [], count: (customers ?? []).length };
}

async function comparePeriods(
  input: {
    metric: string;
    period_a: { from: string; to: string };
    period_b: { from: string; to: string };
  },
  businessId: string
): Promise<unknown> {
  const supabase = supabaseAdmin;

  async function fetchPeriodSales(from: string, to: string) {
    const { data } = await supabase
      .from('pos_sales')
      .select('total_amount, status')
      .eq('business_id', businessId)
      .neq('status', 'voided')
      .gte('created_at', `${from}T00:00:00`)
      .lte('created_at', `${to}T23:59:59`);
    return data ?? [];
  }

  function computeMetric(rows: { total_amount: number }[], metric: string): number {
    const total = rows.reduce((s, r) => s + (r.total_amount ?? 0), 0);
    if (metric === 'revenue') return total;
    if (metric === 'transactions') return rows.length;
    if (metric === 'avg_order') return rows.length ? total / rows.length : 0;
    return 0;
  }

  const [rowsA, rowsB] = await Promise.all([
    fetchPeriodSales(input.period_a.from, input.period_a.to),
    fetchPeriodSales(input.period_b.from, input.period_b.to),
  ]);

  const valA = computeMetric(rowsA, input.metric);
  const valB = computeMetric(rowsB, input.metric);
  const changePct = valA === 0 ? null : ((valB - valA) / valA) * 100;

  return {
    period_a: { from: input.period_a.from, to: input.period_a.to, value: valA },
    period_b: { from: input.period_b.from, to: input.period_b.to, value: valB },
    metric: input.metric,
    change_pct: changePct !== null ? parseFloat(changePct.toFixed(2)) : null,
    direction: changePct === null ? 'unknown' : changePct > 0 ? 'up' : changePct < 0 ? 'down' : 'flat',
  };
}

function suggestPromotion(input: { goal: string; constraints?: string }): unknown {
  const promotions: Record<string, { type: string; discount_pct: number; expiry_days: number; applies_to: string }> = {
    'clear-stock': { type: 'clearance', discount_pct: 30, expiry_days: 14, applies_to: 'dead_stock_products' },
    'boost-margin': { type: 'bundle', discount_pct: 10, expiry_days: 30, applies_to: 'high_margin_products' },
    'attract-new': { type: 'first_purchase', discount_pct: 15, expiry_days: 60, applies_to: 'all_products' },
    'retain-loyal': { type: 'loyalty_reward', discount_pct: 20, expiry_days: 30, applies_to: 'top_customers' },
  };

  const rule = promotions[input.goal] ?? { type: 'general', discount_pct: 10, expiry_days: 30, applies_to: 'all_products' };

  return {
    goal: input.goal,
    constraints: input.constraints ?? null,
    rule_jsonb: rule,
  };
}

// ─── New autonomous tools ─────────────────────────────────────────────────

// Schema-aware entity mapping with REAL column names from the database
const ENTITY_TABLES: Record<string, { table: string; defaultColumns: string[]; defaultOrder: string; columnAliases?: Record<string, string> }> = {
  sales:     {
    table: 'pos_sales',
    defaultColumns: ['id','total_amount','payment_method','created_at','status','customer_id','customer_name','sale_number','subtotal','tax_total','discount_total'],
    defaultOrder: 'created_at',
  },
  products:  {
    table: 'pos_products',
    defaultColumns: ['id','name','sku','barcode','price','cost_price','stock_quantity','current_stock','category','brand','is_active','description'],
    defaultOrder: 'name',
    columnAliases: { selling_price: 'price', sell_price: 'price', retail_price: 'price', stock: 'stock_quantity', inventory: 'stock_quantity' },
  },
  customers: {
    table: 'pos_customers',
    defaultColumns: ['id','name','phone','email','total_spent','visit_count','last_visit','loyalty_points','segment'],
    defaultOrder: 'total_spent',
  },
  staff:     {
    table: 'staff_members',
    defaultColumns: ['id','first_name','last_name','position','department','employment_type','pay_rate_cents','status','start_date'],
    defaultOrder: 'first_name',
  },
  suppliers: {
    table: 'pos_suppliers',
    defaultColumns: ['id','name','contact_name','email','phone','address','notes'],
    defaultOrder: 'name',
  },
  reviews:   {
    table: 'google_reviews',
    defaultColumns: ['id','reviewer_name','rating','comment','review_date','has_reply','sentiment','reply_text'],
    defaultOrder: 'review_date',
  },
  inventory: {
    table: 'stock_movements',
    defaultColumns: ['id','item_id','movement_type','quantity_added','new_stock','notes','scanned_at'],
    defaultOrder: 'scanned_at',
    columnAliases: { product_id: 'item_id', quantity_change: 'quantity_added', reason: 'notes' },
  },
  actions:   {
    table: 'aria_actions',
    defaultColumns: ['id','title','category','priority','status','recommendation','expected_impact','created_at'],
    defaultOrder: 'created_at',
  },
};

// Map user-friendly column names to actual DB column names
function resolveColumn(entity: string, col: string): string {
  const cfg = ENTITY_TABLES[entity];
  if (!cfg) return col;
  return cfg.columnAliases?.[col] ?? col;
}

// SQL-GUARD-1: fire-and-forget guard-event log — never blocks or fails the query
function logGuardEvent(businessId: string, summary: string, signal: string): void {
  void (async () => {
    try {
      await supabaseAdmin.from('aria_ai_calls').insert({
        business_id: businessId,
        agent_key: 'sql_guard',
        provider: 'other',
        role: 'other',
        success: true,
        request_summary: summary.slice(0, 200),
        learning_signal: signal,
      });
    } catch { /* non-fatal */ }
  })();
}

// SQL-GUARD-1 Guard 3: closest known columns for a bad column name (shared 4-char prefix either way)
function similarColumns(badCol: string, entity: string): string[] {
  const cfg = ENTITY_TABLES[entity];
  if (!cfg) return [];
  const all = [...cfg.defaultColumns, ...Object.keys(cfg.columnAliases ?? {})];
  return all.filter(c => c.includes(badCol.slice(0, 4)) || badCol.includes(c.slice(0, 4))).slice(0, 5);
}

async function queryBusinessData(input: Record<string, unknown>, businessId: string): Promise<unknown> {
  const entity = String(input.entity ?? '');
  const cfg = ENTITY_TABLES[entity];
  if (!cfg) return { error: `Unknown entity: ${entity}. Available: ${Object.keys(ENTITY_TABLES).join(', ')}` };

  const filters = (input.filters ?? {}) as Record<string, unknown>;
  // Resolve column aliases (e.g. selling_price → price)
  const rawOrderBy = String(input.order_by ?? cfg.defaultOrder);
  const orderBy = resolveColumn(entity, rawOrderBy);
  const ascending = input.order_direction === 'asc';
  const limit = Math.min(Number(input.limit ?? 20), 200);

  let query = supabaseAdmin.from(cfg.table).select(cfg.defaultColumns.join(',')).eq('business_id', businessId);

  for (const [key, value] of Object.entries(filters)) {
    if (value == null) continue;
    const resolved = resolveColumn(entity, key);
    if (key === 'since' && typeof value === 'string') {
      const col = entity === 'inventory' ? 'scanned_at' : 'created_at';
      query = query.gte(col, value);
    } else if (key === 'until' && typeof value === 'string') {
      const col = entity === 'inventory' ? 'scanned_at' : 'created_at';
      query = query.lte(col, value);
    } else if (key === 'min_amount' && typeof value === 'number') {
      query = query.gte('total_amount', value);
    } else if (key === 'name_starts_with' && typeof value === 'string') {
      query = query.ilike('name', `${value}%`);
    } else if (key === 'name_starts_with_any' && Array.isArray(value)) {
      // Handle array of prefixes (e.g. ['x','z'])
      const orFilter = (value as unknown[]).map(v => `name.ilike.${String(v)}%`).join(',');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      query = (query as any).or(orFilter);
    } else if (key === 'name_contains' && typeof value === 'string') {
      query = query.ilike('name', `%${value}%`);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      query = query.eq(resolved, value as any);
    }
  }

  // SQL-GUARD-1 Guard 2: inject voided filter ONLY when no explicit status filter was provided
  // (previously unconditional — an explicit status filter, e.g. status='voided', was contradicted by the neq)
  if (entity === 'sales') {
    if (!('status' in filters)) {
      query = query.neq('status', 'voided');
      logGuardEvent(businessId, 'voided filter injected on pos_sales (no status filter in query)', 'guard_fired:voided_filter_injected');
    }
  }
  if (entity === 'products' && !filters.is_active && !filters.status) query = query.neq('is_active', false);

  query = query.order(orderBy, { ascending }).limit(limit);

  const { data, error } = await query;
  if (error) {
    // Self-healing: if column not found, retry with a relaxed query
    if (error.message.includes('column') && error.message.includes('does not exist')) {
      // SQL-GUARD-1 Guard 3: schema-aware hint so the LLM's next tool call can self-correct
      const colMatch = error.message.match(/column "?(?:[a-z_]+\.)?([a-zA-Z_]+)"? does not exist/i);
      const badCol = colMatch?.[1] ?? '';
      const candidates = badCol ? similarColumns(badCol, entity) : [];
      const hint = badCol
        ? `Column "${badCol}" does not exist on table "${cfg.table}". Did you mean one of: ${(candidates.length > 0 ? candidates : cfg.defaultColumns.slice(0, 8)).join(', ')}?`
        : undefined;
      if (hint) logGuardEvent(businessId, `schema hint: ${badCol} on ${cfg.table}`, 'guard_fired:schema_hint');
      const { data: fallback, error: fbErr } = await supabaseAdmin
        .from(cfg.table)
        .select(cfg.defaultColumns.join(','))
        .eq('business_id', businessId)
        .order(cfg.defaultOrder, { ascending })
        .limit(limit);
      if (fbErr) {
        return {
          error: 'column_not_found',
          requested_column: badCol || undefined,
          table: cfg.table,
          available_similar_columns: candidates,
          hint: hint ?? fbErr.message,
          rows: [],
        };
      }
      return { entity, count: (fallback ?? []).length, rows: fallback ?? [], note: 'Filter was ignored due to schema mismatch — returning default sort' + (hint ? '. ' + hint : '') };
    }
    return { error: error.message, rows: [] };
  }

  // SQL-GUARD-1 Guard 1: entity 'customers' maps to pos_customers — if that table is EMPTY for this
  // business, transparently fall back to the legacy customers table so Aria never reports zero customers
  // for a business whose records live in the other table.
  if (entity === 'customers' && (data ?? []).length === 0) {
    const { count: posCount } = await supabaseAdmin.from('pos_customers').select('id', { count: 'exact', head: true }).eq('business_id', businessId);
    if ((posCount ?? 0) === 0) {
      const { data: legacy, error: legacyErr } = await supabaseAdmin
        .from('customers')
        .select('id,name,phone,email,total_spent,visit_count,last_visit,customer_segment,churn_risk')
        .eq('business_id', businessId)
        .order('total_spent', { ascending: false, nullsFirst: false })
        .limit(limit);
      if (!legacyErr && (legacy ?? []).length > 0) {
        logGuardEvent(businessId, 'customers entity: pos_customers empty, returned legacy customers rows', 'guard_fired:customers_empty_rewrite');
        return { entity, count: (legacy ?? []).length, rows: legacy ?? [], note: 'pos_customers is empty for this business — rows returned from the customers table instead' };
      }
    }
  }

  return { entity, count: (data ?? []).length, rows: data ?? [] };
}

async function generateReport(input: Record<string, unknown>, businessId: string): Promise<unknown> {
  const title = String(input.title ?? 'Aria Report');
  const entity = String(input.entity ?? 'products');
  const format = input.format === 'csv' ? 'csv' : 'xlsx';
  const cols = Array.isArray(input.columns) ? input.columns.map(String) : [];
  const limit = Math.min(Number(input.limit ?? 1000), 10000);

  const data = await queryBusinessData({ ...input, limit, entity }, businessId) as { rows?: unknown[]; error?: string };
  if (data.error) return { error: data.error };
  const rows = data.rows ?? [];
  if (rows.length === 0) return { error: 'No data found to export' };

  const filtered = cols.length > 0
    ? rows.map(r => {
        const row = r as Record<string, unknown>;
        const out: Record<string, unknown> = {};
        for (const c of cols) out[c] = row[c];
        return out;
      })
    : rows;

  const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
  const safeName = title.replace(/[^a-zA-Z0-9-]/g, '_').slice(0, 50);
  const filename = `${safeName}_${ts}.${format}`;

  let buf: Buffer;
  let mime: string;
  if (format === 'csv') {
    const ws = XLSX.utils.json_to_sheet(filtered);
    buf = Buffer.from(XLSX.utils.sheet_to_csv(ws), 'utf-8');
    mime = 'text/csv';
  } else {
    const ws = XLSX.utils.json_to_sheet(filtered);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, title.slice(0, 31));
    buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }

  const path = `aria-reports/${businessId}/${randomUUID()}_${filename}`;
  const { error: uploadErr } = await supabaseAdmin.storage.from('reports').upload(path, buf, { contentType: mime, upsert: false });

  if (uploadErr) {
    return { error: 'Upload failed: ' + uploadErr.message, inline_data: filtered.slice(0, 20) };
  }

  const { data: signed } = await supabaseAdmin.storage.from('reports').createSignedUrl(path, 3600);
  return { ok: true, filename, rows: filtered.length, download_url: signed?.signedUrl, format, preview: filtered.slice(0, 5) };
}

async function saveExtractedReceipt(input: Record<string, unknown>, businessId: string): Promise<unknown> {
  const vendor = String(input.vendor ?? '').trim();
  const total = Number(input.total ?? 0);
  const date = String(input.date ?? '').trim();
  const category = String(input.category ?? 'general').trim();
  if (!vendor || total <= 0 || !date) return { error: 'vendor, total (>0), and date are required' };

  const { data, error } = await supabaseAdmin.from('business_expenses').insert({
    business_id: businessId,
    label: vendor,
    amount: total,
    sort_order: 0,
    created_at: new Date(date).toISOString(),
  }).select('id').single();

  if (error) return { error: error.message };
  return { ok: true, id: (data as Record<string, unknown>)?.id, vendor, amount: total, date, category };
}

async function fetchUrl(input: Record<string, unknown>): Promise<unknown> {
  const url = String(input.url ?? '');
  const extract = String(input.extract ?? 'main_content');
  if (!url) return { error: 'url required' };
  if (!/^https?:\/\//.test(url)) return { error: 'Invalid URL — must start with https://' };

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-AU,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Upgrade-Insecure-Requests': '1',
      },
      signal: AbortSignal.timeout(10_000),
      redirect: 'follow',
    });

    if (!res.ok) {
      if (res.status === 403 || res.status === 429 || res.status === 503) {
        return {
          error: `Site blocks automated access (HTTP ${res.status}). Use web_search with the site name instead.`,
          blocked: true,
          status: res.status,
        };
      }
      return { error: `Page returned ${res.status}` };
    }

    const html = await res.text();

    if (extract === 'links') {
      const links = [...html.matchAll(/href="(https?:\/\/[^"]+)"/g)].map(m => m[1]).slice(0, 50);
      return { url, links, count: links.length };
    }

    if (extract === 'tables') {
      const tables = [...html.matchAll(/<table[\s\S]*?<\/table>/gi)].map(m =>
        m[0].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      ).slice(0, 10);
      return { url, tables };
    }

    const cleaned = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim();

    const text = extract === 'full_text' ? cleaned : cleaned.slice(0, 8000);
    return { url, content: text, length: cleaned.length, truncated: cleaned.length > text.length };
  } catch (e) {
    return { error: `Failed to fetch: ${(e as Error).message}` };
  }
}

async function sendEmailNow(input: Record<string, unknown>): Promise<unknown> {
  const to = String(input.to ?? '');
  const subject = String(input.subject ?? '');
  const body = String(input.body ?? '');
  if (!to || !subject || !body) return { error: 'to, subject, body required' };
  if (!process.env.RESEND_API_KEY) {
    console.error('[aria-tool/send_email_now] RESEND_API_KEY missing');
    return { error: 'Email sending requires RESEND_API_KEY in env vars' };
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Aria <aria@ariaos.site>', to, subject, html: body }),
  });
  if (!res.ok) return { error: 'Send failed: ' + (await res.text().catch(() => '')).slice(0, 200) };
  const d = await res.json();
  return { ok: true, id: (d as Record<string, unknown>).id, to, subject };
}

async function sendSmsNow(input: Record<string, unknown>): Promise<unknown> {
  const to = String(input.to ?? '');
  const message = String(input.message ?? '');
  if (!to || !message) return { error: 'to, message required' };
  const phone = to.replace(/\s/g, '').replace(/^0/, '+61');
  const smsResult = await sendSMS(phone, message);
  if (!smsResult.ok) {
    return { error: smsResult.error ?? 'SMS failed' };
  }
  return { ok: true, to: phone, message };
}

async function updateProductPrice(input: Record<string, unknown>, businessId: string): Promise<unknown> {
  const productId = String(input.product_id ?? '');
  const newPrice = Number(input.new_price ?? 0);
  if (!productId || newPrice <= 0) return { error: 'product_id and positive new_price required' };
  // ASK-ARIA-CONSOLIDATE-2 (RC6): self-gate (defence in depth). Even if a caller bypasses the route's
  // GATED_TOOL_WRITES wrapper, a price change does not execute without an explicit confirmed:true flag.
  if (input.confirmed !== true) {
    return { requires_confirmation: true, not_executed: true, tool: 'update_product_price', message: 'Price change needs explicit confirmation — re-call with confirmed:true once the owner approves.' };
  }

  const { data: existing } = await supabaseAdmin.from('pos_products')
    .select('id, name, price').eq('id', productId).eq('business_id', businessId).maybeSingle();
  if (!existing) return { error: 'Product not found' };

  const { error } = await supabaseAdmin.from('pos_products')
    .update({ price: newPrice }).eq('id', productId).eq('business_id', businessId);
  if (error) return { error: error.message };
  return { ok: true, product: existing.name, old_price: (existing as Record<string, unknown>).price, new_price: newPrice };
}

async function generateImage(input: Record<string, unknown>, businessId: string): Promise<unknown> {
  const prompt = String(input.prompt ?? '');
  const size = String(input.size ?? '1024x1024');
  if (!prompt) return { error: 'prompt required' };
  if (!process.env.OPENAI_API_KEY) {
    console.error('[aria-tool/generate_image] OPENAI_API_KEY not set in env');
    return { error: 'Image generation requires OPENAI_API_KEY in Vercel environment variables (admin setup needed)' };
  }

  // Try strategies in order — gpt-image-1 first (current), fall back to dall-e-3 if needed
  // Image generation strategies - ordered by reliability
  // gpt-image-1 first (confirmed working on this OpenAI account)
  // Imagen 3 second (cheaper but may have quota issues)
  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  const OPENAI_KEY = process.env.OPENAI_API_KEY;

  // Imagen 3 is FASTEST (~8-12s vs gpt-image-1 ~15-30s) — put it first
  // The previous 504s were caused by the Gemini INTENT CLASSIFIER (now fixed, uses Haiku)
  // not by Imagen itself. Imagen 3 actually works fine.
  const strategies = [
    { name: 'imagen-3-gemini', provider: 'gemini' },
    { name: 'gpt-image-1', provider: 'openai' },
    { name: 'gpt-image-1-mini', provider: 'openai-mini' },
  ];

  let lastError = '';
  for (const strategy of strategies) {
    try {
      console.log('[aria-tool/generate_image] trying strategy:', strategy.name);

      if (strategy.provider === 'gemini' && GEMINI_KEY) {
        // Google Imagen 3 via Gemini API
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${GEMINI_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              instances: [{ prompt }],
              parameters: { sampleCount: 1, aspectRatio: '1:1', safetyFilterLevel: 'block_few' },
            }),
            signal: AbortSignal.timeout(15_000),
          }
        );
        if (!res.ok) {
          const err = await res.text();
          console.error('[aria-tool/generate_image] Imagen failed:', res.status, err.slice(0, 300));
          lastError = `imagen: ${res.status} ${err.slice(0, 150)}`;
          continue;
        }
        const d = await res.json() as { predictions?: Array<{ bytesBase64Encoded?: string; mimeType?: string }> };
        const b64 = d.predictions?.[0]?.bytesBase64Encoded;
        if (!b64) { lastError = 'Imagen: no image in response'; continue; }
        const buf = Buffer.from(b64, 'base64');
        const filename = `image_${Date.now()}.png`;
        const path = `aria-images/${businessId}/${filename}`;
        const { error: upErr } = await supabaseAdmin.storage.from('reports').upload(path, buf, { contentType: 'image/png' });
        if (upErr) return { error: 'Storage upload failed: ' + upErr.message };
        const { data: signed } = await supabaseAdmin.storage.from('reports').createSignedUrl(path, 86400);
        console.log('[aria-tool/generate_image] success with', strategy.name);
        return { ok: true, filename, download_url: signed?.signedUrl, format: 'png', strategy: strategy.name };

      } else if ((strategy.provider === 'openai' || strategy.provider === 'openai-mini') && OPENAI_KEY) {
        const model = strategy.provider === 'openai-mini' ? 'gpt-image-1-mini' : 'gpt-image-1';
        const imgT0 = Date.now();
        console.log('[generate_image] calling', model, 'prompt:', prompt.slice(0, 80));
        const res = await fetch('https://api.openai.com/v1/images/generations', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, prompt, n: 1, size: '1024x1024' }),
          signal: AbortSignal.timeout(28_000),
        });
        console.log('[generate_image]', model, 'response in', Date.now()-imgT0, 'ms status:', res.status);
        if (!res.ok) {
          const err = await res.text();
          console.error('[aria-tool/generate_image] OpenAI', model, 'failed:', res.status, err.slice(0, 300));
          lastError = `${model}: ${res.status} ${err.slice(0, 150)}`;
          continue;
        }
        const d = await res.json() as { data?: Array<{ b64_json?: string; url?: string }> };
        const item = d.data?.[0];
        const b64 = item?.b64_json;
        const url = item?.url;
        let buf: Buffer;
        if (b64) {
          buf = Buffer.from(b64, 'base64');
        } else if (url) {
          const imgRes = await fetch(url);
          if (!imgRes.ok) { lastError = 'URL fetch failed'; continue; }
          buf = Buffer.from(await imgRes.arrayBuffer());
        } else { lastError = 'no image data'; continue; }
        const filename = `image_${Date.now()}.png`;
        const path = `aria-images/${businessId}/${filename}`;
        const { error: upErr } = await supabaseAdmin.storage.from('reports').upload(path, buf, { contentType: 'image/png' });
        if (upErr) return { error: 'Storage upload failed: ' + upErr.message };
        const { data: signed } = await supabaseAdmin.storage.from('reports').createSignedUrl(path, 86400);
        console.log('[aria-tool/generate_image] success with', strategy.name);
        return { ok: true, filename, download_url: signed?.signedUrl, format: 'png', strategy: strategy.name };
      }
    } catch (e) {
      lastError = String(e);
      console.error('[aria-tool/generate_image] exception in', strategy.name, ':', lastError);
    }
  }

  return { error: 'Image generation failed. Last error: ' + lastError + '. Keys set: gemini=' + !!GEMINI_KEY + ' openai=' + !!OPENAI_KEY };
}

async function runCalculation(input: Record<string, unknown>): Promise<unknown> {
  const expression = String(input.expression ?? '');
  const explanation = String(input.explanation ?? '');
  if (!expression) return { error: 'expression required' };

  try {
    const math = await import('mathjs');
    const result = math.evaluate(expression);
    return {
      ok: true,
      expression,
      result: typeof result === 'number' ? result : String(result),
      formatted: typeof result === 'number' ? result.toLocaleString('en-AU', { maximumFractionDigits: 4 }) : String(result),
      explanation,
    };
  } catch (e) {
    return { error: 'Calculation failed: ' + String(e) };
  }
}

async function generatePdf(input: Record<string, unknown>, businessId: string): Promise<unknown> {
  const title = String(input.title ?? 'Aria Report');
  const sections = Array.isArray(input.sections) ? input.sections : [];
  if (sections.length === 0) return { error: 'No sections provided' };

  try {
    // Generate as styled HTML that users can print-to-PDF in browser
    // Native pdf library has font/asset issues in Vercel — HTML is more reliable
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>
  @page { margin: 2cm; }
  body { font-family: -apple-system, Inter, Arial, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 20px; color: #1a1a1a; line-height: 1.6; }
  h1 { color: #2D5240; border-bottom: 2px solid #7FB897; padding-bottom: 8px; margin-bottom: 24px; }
  h2 { color: #2D5240; margin-top: 32px; font-size: 18px; }
  .section-content { white-space: pre-wrap; }
  footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #eee; color: #888; font-size: 11px; }
  .print-hint { position: fixed; top: 12px; right: 12px; padding: 10px 16px; background: #2D5240; color: #7FB897; border-radius: 8px; font-size: 12px; }
  @media print { .print-hint { display: none; } }
</style></head><body>
<div class="print-hint">Press Cmd/Ctrl+P → Save as PDF</div>
<h1>${title}</h1>
${sections.map(s => {
  const sec = s as Record<string, unknown>;
  return `<h2>${String(sec.heading ?? '')}</h2><div class="section-content">${String(sec.content ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>`;
}).join('')}
<footer>Generated by Aria · ${new Date().toLocaleDateString('en-AU', { dateStyle: 'long' })}</footer>
</body></html>`;

    const buf = Buffer.from(html, 'utf-8');
    const filename = `${title.replace(/[^a-z0-9]/gi, '_').slice(0, 50)}.html`;
    const path = `aria-reports/${businessId}/${randomUUID()}_${filename}`;
    const { error: upErr } = await supabaseAdmin.storage.from('reports').upload(path, buf, { contentType: 'text/html' });
    if (upErr) return { error: 'Upload failed: ' + upErr.message };

    const { data: signed } = await supabaseAdmin.storage.from('reports').createSignedUrl(path, 3600);
    return { ok: true, filename, download_url: signed?.signedUrl, format: 'html', note: 'Open the file and press Cmd/Ctrl+P to save as PDF' };
  } catch (e) {
    return { error: String(e) };
  }
}

interface BankTxnRow { amount: number | null; transaction_date: string | null; description: string | null; category: string | null }

async function queryBankBalance(input: { metric?: string }, businessId: string): Promise<unknown> {
  const metric = input.metric ?? 'summary';
  const { data: connectedAccts } = await supabaseAdmin.from('bank_accounts').select('id').eq('business_id', businessId).eq('is_active', true).limit(1);
  if (!connectedAccts?.length) return { connected: false, message: 'Bank not connected. Go to Settings → Integrations to connect via Basiq.' };

  if (metric === 'balance') {
    const { data: accounts } = await supabaseAdmin.from('bank_accounts')
      .select('account_name, institution_name, balance, available_balance, currency, last_synced_at')
      .eq('business_id', businessId).eq('is_active', true);
    const total = (accounts ?? []).reduce((a, x) => a + Number(x.balance ?? 0), 0);
    return { total_balance: Math.round(total * 100) / 100, accounts: accounts ?? [] };
  }

  if (metric === 'transactions') {
    const { data: txns } = await supabaseAdmin.from('bank_transactions')
      .select('amount, transaction_date, description, category')
      .eq('business_id', businessId).order('transaction_date', { ascending: false }).limit(10);
    return { recent: txns ?? [] };
  }

  // TZ-1: AEST month start (transaction_date is a date column — use the AEST calendar date)
  const monthStartDate = todayAEST().slice(0, 7) + '-01';
  const { data: rows } = await supabaseAdmin.from('bank_transactions')
    .select('amount, transaction_date, description, category')
    .eq('business_id', businessId)
    .gte('transaction_date', monthStartDate);
  const list = (rows ?? []) as BankTxnRow[];
  const income = list.filter(r => Number(r.amount ?? 0) > 0).reduce((a, r) => a + Number(r.amount ?? 0), 0);
  const expenses = list.filter(r => Number(r.amount ?? 0) < 0).reduce((a, r) => a + Math.abs(Number(r.amount ?? 0)), 0);

  if (metric === 'cashflow') {
    const cats: Record<string, number> = {};
    for (const r of list) {
      const amt = Number(r.amount ?? 0);
      if (amt >= 0) continue;
      const c = r.category ?? 'Uncategorised';
      cats[c] = (cats[c] ?? 0) + Math.abs(amt);
    }
    const top = Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([category, amount]) => ({ category, amount: Math.round(amount * 100) / 100 }));
    return { top_expense_categories: top };
  }

  // summary (default)
  const { data: accounts } = await supabaseAdmin.from('bank_accounts').select('balance').eq('business_id', businessId).eq('is_active', true);
  const total = (accounts ?? []).reduce((a, x) => a + Number(x.balance ?? 0), 0);
  return {
    total_balance: Math.round(total * 100) / 100,
    month_income: Math.round(income * 100) / 100,
    month_expenses: Math.round(expenses * 100) / 100,
    month_net: Math.round((income - expenses) * 100) / 100,
  };
}

async function getBusinessProfile(businessId: string): Promise<unknown> {
  const { data: biz } = await supabaseAdmin
    .from('businesses')
    .select('id, name, type, city, suburb, address, phone, timezone, closing_hour_local, google_average_rating, google_total_reviews')
    .eq('id', businessId)
    .maybeSingle();
  if (!biz) return { error: 'Business not found' };
  const b = biz as Record<string, unknown>;
  const trackFields = ['city', 'suburb', 'address', 'phone', 'closing_hour_local', 'timezone'];
  const nullFields = trackFields.filter(f => b[f] == null || b[f] === '');
  return {
    ...b,
    null_fields: nullFields,
    instruction: nullFields.length > 0
      ? 'DO NOT guess or invent values for: ' + nullFields.join(', ') + '. If asked, say these are not set in the system.'
      : 'All core profile fields are populated.',
  };
}

async function getTop(
  input: { subject: string; period: string; limit?: number },
  businessId: string
): Promise<unknown> {
  const limit = input.limit ?? 5;
  const from = getPeriodStart(input.period);

  if (input.subject === 'products') {
    const { data: sales } = await supabaseAdmin
      .from('pos_sales').select('id').eq('business_id', businessId).neq('status', 'voided').gte('created_at', from);
    const saleIds = (sales ?? []).map(s => s.id);
    if (!saleIds.length) return { subject: 'products', rows: [], period: input.period };
    const { data: items } = await supabaseAdmin
      .from('pos_sale_items').select('product_name, quantity, line_total').in('sale_id', saleIds);
    const map: Record<string, { name: string; qty: number; revenue: number }> = {};
    for (const item of items ?? []) {
      const key = (item as Record<string, unknown>).product_name as string ?? 'Unknown';
      if (!map[key]) map[key] = { name: key, qty: 0, revenue: 0 };
      map[key].qty += Number((item as Record<string, unknown>).quantity ?? 1);
      map[key].revenue += Number((item as Record<string, unknown>).line_total ?? 0);
    }
    const rows = Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, limit)
      .map(r => ({ ...r, revenue: Math.round(r.revenue * 100) / 100 }));
    return { subject: 'products', rows, period: input.period };
  }

  if (input.subject === 'customers') {
    const { data } = await supabaseAdmin
      .from('pos_customers').select('id, name, total_spent, visit_count, last_visit_at')
      .eq('business_id', businessId).order('total_spent', { ascending: false }).limit(limit);
    const rows = (data ?? []).map(c => ({ ...c, total_spent: Math.round(Number((c as Record<string, unknown>).total_spent ?? 0) * 100) / 100 }));
    return { subject: 'customers', rows, period: input.period };
  }

  if (input.subject === 'staff') {
    // Fetch attributed and total sales to compute completeness % (must be surfaced as caveat)
    const [{ data: attributedData }, { count: totalCount }] = await Promise.all([
      supabaseAdmin.from('pos_sales').select('served_by, total_amount').eq('business_id', businessId)
        .neq('status', 'voided').gte('created_at', from).not('served_by', 'is', null),
      supabaseAdmin.from('pos_sales').select('*', { count: 'exact', head: true })
        .eq('business_id', businessId).neq('status', 'voided').gte('created_at', from),
    ])
    if (!attributedData?.length) {
      return { subject: 'staff', available: false, reason: 'No staff tracking data in this period — served_by is not recorded for sales at this business.', period: input.period };
    }
    const totalSales = totalCount ?? 0
    const attributedCount = attributedData.length
    const completenessPercent = totalSales > 0 ? Math.round((attributedCount / totalSales) * 100) : 0
    const completeness_caveat = `Based on ${completenessPercent}% of sales with staff recorded (${attributedCount}/${totalSales} sales). Rankings are partial — you MUST state this caveat.`
    const map: Record<string, { name: string; sales: number; transactions: number }> = {};
    for (const row of attributedData) {
      const r = row as Record<string, unknown>;
      const key = r.served_by as string ?? 'Unknown';
      if (!map[key]) map[key] = { name: key, sales: 0, transactions: 0 };
      map[key].sales += Number(r.total_amount ?? 0);
      map[key].transactions += 1;
    }
    const rows = Object.values(map).sort((a, b) => b.sales - a.sales).slice(0, limit)
      .map(r => ({ ...r, sales: Math.round(r.sales * 100) / 100, avg_basket: r.transactions > 0 ? Math.round((r.sales / r.transactions) * 100) / 100 : 0 }));
    return { subject: 'staff', rows, period: input.period, completeness_caveat };
  }

  if (input.subject === 'payment_methods') {
    const { data } = await supabaseAdmin
      .from('pos_sales').select('payment_method, total_amount').eq('business_id', businessId)
      .neq('status', 'voided').gte('created_at', from);
    const map: Record<string, { method: string; revenue: number; transactions: number }> = {};
    for (const row of data ?? []) {
      const r = row as Record<string, unknown>;
      const key = r.payment_method as string ?? 'unknown';
      if (!map[key]) map[key] = { method: key, revenue: 0, transactions: 0 };
      map[key].revenue += Number(r.total_amount ?? 0);
      map[key].transactions += 1;
    }
    const rows = Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, limit)
      .map(r => ({ ...r, revenue: Math.round(r.revenue * 100) / 100 }));
    return { subject: 'payment_methods', rows, period: input.period };
  }

  if (input.subject === 'categories') {
    const { data: salesData } = await supabaseAdmin
      .from('pos_sales').select('id').eq('business_id', businessId).neq('status', 'voided').gte('created_at', from);
    const saleIds = (salesData ?? []).map(s => s.id);
    if (!saleIds.length) return { subject: 'categories', rows: [], period: input.period };
    const { data: items } = await supabaseAdmin
      .from('pos_sale_items').select('product_name, quantity, line_total').in('sale_id', saleIds);
    const productNames = [...new Set((items ?? []).map(i => (i as Record<string, unknown>).product_name as string).filter(Boolean))];
    const { data: products } = await supabaseAdmin
      .from('pos_products').select('name, category').eq('business_id', businessId)
      .in('name', productNames.slice(0, 500));
    const catMap: Record<string, string> = {};
    for (const p of products ?? []) catMap[(p as Record<string, unknown>).name as string ?? ''] = (p as Record<string, unknown>).category as string ?? 'Uncategorised';
    const map: Record<string, { category: string; revenue: number; qty: number }> = {};
    for (const item of items ?? []) {
      const i = item as Record<string, unknown>;
      const cat = catMap[i.product_name as string ?? ''] ?? 'Uncategorised';
      if (!map[cat]) map[cat] = { category: cat, revenue: 0, qty: 0 };
      map[cat].revenue += Number(i.line_total ?? 0);
      map[cat].qty += Number(i.quantity ?? 1);
    }
    const rows = Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, limit)
      .map(r => ({ ...r, revenue: Math.round(r.revenue * 100) / 100 }));
    return { subject: 'categories', rows, period: input.period };
  }

  return { error: 'Unknown subject: ' + input.subject + '. Valid: products, customers, staff, payment_methods, categories' };
}

async function getSummary(input: { period: string }, businessId: string): Promise<unknown> {
  const from = getPeriodStart(input.period);
  const { data } = await supabaseAdmin
    .from('pos_sales').select('total_amount, customer_id').eq('business_id', businessId)
    .neq('status', 'voided').gte('created_at', from);
  const rows = (data ?? []) as Array<{ total_amount: number | null; customer_id: string | null }>;
  const total_revenue = rows.reduce((s, r) => s + Number(r.total_amount ?? 0), 0);
  const sale_count = rows.length;
  const avg_ticket = sale_count > 0 ? total_revenue / sale_count : 0;
  const unique_customers = new Set(rows.filter(r => r.customer_id).map(r => r.customer_id)).size;
  return {
    period: input.period,
    from,
    total_revenue: Math.round(total_revenue * 100) / 100,
    sale_count,
    avg_ticket: Math.round(avg_ticket * 100) / 100,
    unique_customers,
  };
}

async function getReviews(input: { period: string }, businessId: string): Promise<unknown> {
  const from = getPeriodStart(input.period);
  const { data } = await supabaseAdmin
    .from('business_reviews').select('rating, review_text, response_status, review_date')
    .eq('business_id', businessId).gte('review_date', from.slice(0, 10))
    .order('review_date', { ascending: false }).limit(100);
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const total_count = rows.length;
  const avg_rating = total_count > 0 ? rows.reduce((s, r) => s + Number(r.rating ?? 0), 0) / total_count : null;
  const unanswered_count = rows.filter(r => r.response_status === 'unanswered' || r.response_status == null).length;
  const by_rating: Record<number, number> = {};
  for (const r of rows) { const rat = Number(r.rating ?? 0); by_rating[rat] = (by_rating[rat] ?? 0) + 1; }
  return {
    period: input.period,
    total_count,
    avg_rating: avg_rating !== null ? Math.round(avg_rating * 10) / 10 : null,
    unanswered_count,
    by_rating,
    recent: rows.slice(0, 5).map(r => ({
      rating: r.rating,
      snippet: String(r.review_text ?? '').slice(0, 120),
      status: r.response_status,
      date: r.review_date,
    })),
  };
}

async function getProfitLeaks(businessId: string): Promise<unknown> {
  const { data } = await supabaseAdmin
    .from('profit_leaks').select('id, title, category, monthly_loss, recommendation, status')
    .eq('business_id', businessId).order('monthly_loss', { ascending: false }).limit(20);
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const total_monthly_loss = rows.reduce((s, r) => s + Number(r.monthly_loss ?? 0), 0);
  return {
    leaks: rows.map(r => ({ ...r, monthly_loss: Math.round(Number(r.monthly_loss ?? 0) * 100) / 100 })),
    count: rows.length,
    total_monthly_loss: Math.round(total_monthly_loss * 100) / 100,
  };
}

export async function executePOSTool(name: string, input: unknown, businessId: string): Promise<unknown> {
  const inp = input as Record<string, unknown>;

  switch (name) {
    case 'query_sales':
      return querySales(inp as Parameters<typeof querySales>[0], businessId);
    case 'query_inventory':
      return queryInventory(inp as Parameters<typeof queryInventory>[0], businessId);
    case 'query_customers':
      return queryCustomers(inp as Parameters<typeof queryCustomers>[0], businessId);
    case 'compare_periods':
      return comparePeriods(inp as Parameters<typeof comparePeriods>[0], businessId);
    case 'generate_chart':
      return { chart_spec: inp };
    case 'suggest_promotion':
      return suggestPromotion(inp as Parameters<typeof suggestPromotion>[0]);
    case 'query_business_data':
      return queryBusinessData(inp, businessId);
    case 'generate_report':
      return generateReport(inp, businessId);
    case 'fetch_url':
      return fetchUrl(inp);
    case 'send_email_now':
      return sendEmailNow(inp);
    case 'send_sms_now':
      return sendSmsNow(inp);
    case 'update_product_price':
      return updateProductPrice(inp, businessId);
    case 'generate_image':
      return generateImage(inp, businessId);
    case 'run_calculation':
      return runCalculation(inp);
    case 'generate_pdf':
      return generatePdf(inp, businessId);
    case 'query_bank_balance':
      return queryBankBalance(inp as { metric?: string }, businessId);
    case 'query_bookings': {
      const { period } = inp as { period: string }
      const now = new Date()
      const fromDate = period === 'today'
        ? now.toISOString().slice(0, 10)
        : period === 'week'
        ? new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
        : new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
      const { data: bRows } = await supabaseAdmin.from('bookings').select('booking_date,booking_time,party_size,status').eq('business_id', businessId).gte('booking_date', fromDate)
      const rows = bRows ?? []
      const total = rows.length
      const noShows = rows.filter(r => (r as Record<string,unknown>).status === 'no_show').length
      const confirmed = rows.filter(r => (r as Record<string,unknown>).status === 'confirmed').length
      const totalGuests = rows.reduce((s, r) => s + (Number((r as Record<string,unknown>).party_size) || 1), 0)
      return { total_bookings: total, confirmed, no_shows: noShows, no_show_rate: total > 0 ? `${Math.round(noShows/total*100)}%` : '0%', total_guests: totalGuests, period }
    }
    case 'query_calendar': {
      // I7 TOOL-USE — READ-ONLY. business_id-scoped on every query; selects only, never writes.
      const daysAhead = Math.max(1, Math.min(90, Math.round(Number((inp as { days_ahead?: number }).days_ahead ?? 14))))
      const today = todayAEST() // AEST date (YYYY-MM-DD)
      const until = new Date(Date.now() + daysAhead * 86400000).toISOString().slice(0, 10)
      const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
      const [hoursRes, bookingsRes, leaveRes] = await Promise.all([
        supabaseAdmin.from('business_hours').select('day_of_week, open_time, close_time, is_closed').eq('business_id', businessId).order('day_of_week'),
        supabaseAdmin.from('bookings').select('booking_date, status, customer_name, party_size').eq('business_id', businessId).gte('booking_date', today).lte('booking_date', until).order('booking_date').limit(50),
        supabaseAdmin.from('staff_leave').select('staff_name, leave_type, start_date, end_date, status').eq('business_id', businessId).lte('start_date', until).gte('end_date', today).limit(50),
      ])
      const trading_hours = (hoursRes.data ?? []).map(h => {
        const hr = h as Record<string, unknown>
        return { day: DOW[Number(hr.day_of_week) % 7] ?? String(hr.day_of_week), closed: !!hr.is_closed, open: hr.is_closed ? null : hr.open_time, close: hr.is_closed ? null : hr.close_time }
      })
      const upcoming_bookings = (bookingsRes.data ?? []).map(b => {
        const br = b as Record<string, unknown>
        return { date: br.booking_date, status: br.status, customer: br.customer_name ?? null, party_size: br.party_size ?? null }
      })
      const staff_on_leave = (leaveRes.data ?? []).map(l => {
        const lr = l as Record<string, unknown>
        return { staff: lr.staff_name ?? null, type: lr.leave_type, from: lr.start_date, to: lr.end_date, status: lr.status }
      })
      // Fire-and-forget audit (agent_key=tool name, role 'data', provider 'other') — matches logGuardEvent.
      void (async () => {
        try {
          await supabaseAdmin.from('aria_ai_calls').insert({
            business_id: businessId, agent_key: 'query_calendar', provider: 'other', role: 'data', success: true,
            request_summary: `days_ahead:${daysAhead}`,
            response_summary: JSON.stringify({ hours: trading_hours.length, bookings: upcoming_bookings.length, on_leave: staff_on_leave.length }).slice(0, 200),
          })
        } catch { /* non-blocking */ }
      })()
      return { days_ahead: daysAhead, from: today, until, trading_hours, upcoming_bookings, staff_on_leave }
    }
    case 'counterfactual_simulate': {
      // I11 COUNTERFACTUAL — delegate to the grounded simulator (logs agent_key='counterfactual'
      // role='forecast' via callAnthropic; inserts a testable aria_hypotheses row, status='active').
      const scenario = String((inp as { scenario?: string }).scenario ?? '').trim()
      if (!scenario) return { error: 'scenario required: describe the what-if action to simulate' }
      const { simulateCounterfactual } = await import('@/lib/aria/hypothesis/counterfactual')
      return simulateCounterfactual(businessId, scenario.slice(0, 500))
    }
    case 'query_online_orders': {
      const { period, status } = inp as { period: string; status?: string }
      const now = new Date()
      const from = period === 'today'
        ? toAESTStart(todayAEST()) // TZ-1: AEST midnight
        : period === 'week'
        ? toAESTStart(startOfWeekAEST().toISOString().slice(0, 10)) // WEEK-1: calendar Mon AEST
        : toAESTStart(todayAEST().slice(0, 7) + '-01') // TZ-1: AEST month start
      let q = supabaseAdmin.from('pos_online_orders').select('total, fulfillment_type, status').eq('business_id', businessId).gte('created_at', from)
      if (status && status !== 'all') q = (q as typeof q).eq('status', status)
      const { data } = await q
      const rows = data ?? []
      const total_revenue = rows.reduce((s, r) => s + (Number((r as Record<string,unknown>).total) || 0), 0)
      const avg = rows.length > 0 ? total_revenue / rows.length : 0
      const pickup  = rows.filter(r => (r as Record<string,unknown>).fulfillment_type === 'pickup').length
      const delivery = rows.filter(r => (r as Record<string,unknown>).fulfillment_type === 'delivery').length
      return { count: rows.length, total_revenue: total_revenue.toFixed(2), avg_order_value: avg.toFixed(2), pickup_count: pickup, delivery_count: delivery, period }
    }
    case 'get_hourly_sales': {
      const { date_range = 'last_30_days' } = inp as { date_range?: string }
      const now = new Date()
      const from = date_range === 'last_7_days' ? new Date(Date.now() - 7 * 86400000).toISOString()
        : date_range === 'this_month' ? new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
        : date_range === 'last_month' ? new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
        : new Date(Date.now() - 30 * 86400000).toISOString()
      const to = date_range === 'last_month' ? new Date(now.getFullYear(), now.getMonth(), 1).toISOString() : now.toISOString()
      const { data } = await supabaseAdmin.from('pos_sales').select('total_amount, created_at').eq('business_id', businessId).neq('status', 'voided').gte('created_at', from).lte('created_at', to).limit(5000)
      const grid: Record<number, Record<number, number>> = {}
      for (const row of (data ?? [])) {
        const d = new Date(row.created_at)
        const dow = d.getDay()
        const hour = d.getHours()
        if (!grid[dow]) grid[dow] = {}
        grid[dow][hour] = (grid[dow][hour] ?? 0) + Number(row.total_amount ?? 0)
      }
      const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
      const result = days.map((day, dow) => ({
        day,
        hours: Array.from({ length: 24 }, (_, h) => ({ hour: h, revenue: Math.round((grid[dow]?.[h] ?? 0) * 100) / 100 })),
      }))
      return { date_range, heatmap: result, total_rows: (data ?? []).length }
    }

    case 'get_product_sales_detail': {
      const { limit = 20, date_range = 'last_30_days' } = inp as { limit?: number; date_range?: string }
      const now = new Date()
      const from = date_range === 'last_7_days' ? new Date(Date.now() - 7 * 86400000).toISOString()
        : date_range === 'this_month' ? new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
        : date_range === 'last_month' ? new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
        : new Date(Date.now() - 30 * 86400000).toISOString()
      const { data } = await supabaseAdmin.from('pos_sale_items').select('product_name, quantity, line_total, pos_sales!inner(business_id, created_at, status)').eq('pos_sales.business_id', businessId).neq('pos_sales.status', 'voided').gte('pos_sales.created_at', from).limit(10000)
      const map: Record<string, { name: string; qty: number; revenue: number }> = {}
      for (const row of (data ?? []) as Array<{ product_name: string | null; quantity: number | null; line_total: number | null }>) {
        const name = row.product_name ?? 'Unknown'
        if (!map[name]) map[name] = { name, qty: 0, revenue: 0 }
        map[name].qty += Number(row.quantity ?? 1)
        map[name].revenue += Number(row.line_total ?? 0)
      }
      const products = Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, limit).map(p => ({ ...p, revenue: Math.round(p.revenue * 100) / 100 }))
      return { date_range, products, total_products: products.length }
    }

    case 'get_cashier_performance': {
      const { date_range = 'last_30_days' } = inp as { date_range?: string }
      const now = new Date()
      const from = date_range === 'last_7_days' ? new Date(Date.now() - 7 * 86400000).toISOString()
        : date_range === 'this_month' ? new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
        : date_range === 'last_month' ? new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
        : new Date(Date.now() - 30 * 86400000).toISOString()
      const { data } = await supabaseAdmin.from('pos_sales').select('served_by, total_amount').eq('business_id', businessId).neq('status', 'voided').gte('created_at', from).limit(10000)
      const allRows = (data ?? []) as Array<{ served_by: string | null; total_amount: number | null }>
      const totalCount = allRows.length
      const attributedCount = allRows.filter(r => r.served_by != null).length
      const completenessPercent = totalCount > 0 ? Math.round((attributedCount / totalCount) * 100) : 0
      const completeness_caveat = `Based on ${completenessPercent}% of sales with staff recorded (${attributedCount}/${totalCount} sales). You MUST state this caveat when reporting rankings.`
      const map: Record<string, { name: string; sales: number; transactions: number }> = {}
      for (const row of allRows.filter(r => r.served_by != null)) {
        const name = row.served_by ?? 'Unknown'
        if (!map[name]) map[name] = { name, sales: 0, transactions: 0 }
        map[name].sales += Number(row.total_amount ?? 0)
        map[name].transactions += 1
      }
      const cashiers = Object.values(map).sort((a, b) => b.sales - a.sales).map(c => ({
        name: c.name, total_sales: Math.round(c.sales * 100) / 100,
        transactions: c.transactions, avg_basket: c.transactions > 0 ? Math.round((c.sales / c.transactions) * 100) / 100 : 0,
      }))
      return { date_range, cashiers, total_cashiers: cashiers.length, completeness_caveat }
    }

    case 'save_extracted_receipt':
      return saveExtractedReceipt(inp, businessId);
    case 'get_business_profile':
      return getBusinessProfile(businessId);
    case 'get_top':
      return getTop(inp as { subject: string; period: string; limit?: number }, businessId);
    case 'get_summary':
      return getSummary(inp as { period: string }, businessId);
    case 'get_reviews':
      return getReviews(inp as { period: string }, businessId);
    case 'get_profit_leaks':
      return getProfitLeaks(businessId);

    case 'web_search': {
      const { query, search_depth = 'basic' } = inp as { query: string; search_depth?: string }
      const tavilyKey = process.env.TAVILY_API_KEY
      if (!tavilyKey) {
        return { error: 'Web search is not configured (TAVILY_API_KEY missing). Answer using your business data tools only, and note that live market benchmarks are unavailable this session.' }
      }
      try {
        const res = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ api_key: tavilyKey, query, search_depth, max_results: 5 }),
          signal: AbortSignal.timeout(15_000),
        })
        if (!res.ok) return { error: 'Web search failed: HTTP ' + res.status + '. Use business data tools instead.' }
        const data = await res.json() as { results?: Array<{ title: string; url: string; content: string; published_date?: string }> }
        const results = (data.results ?? []).slice(0, 5).map(r => ({
          title: r.title,
          url: r.url,
          snippet: (r.content ?? '').slice(0, 600),
          published_date: r.published_date ?? null,
        }))
        return { query, results, count: results.length }
      } catch (e) {
        return { error: 'Web search timed out or failed: ' + (e as Error).message + '. Use business data tools instead.' }
      }
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
