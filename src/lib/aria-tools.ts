import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import { supabaseAdmin } from '@/lib/supabase-admin';
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
          enum: ['day', 'week', 'month', 'product', 'cashier', 'payment_method'],
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
    description: 'Generate a promotion rule JSON for a given business goal.',
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
    description: 'Query the business database for any entity. Returns up-to-date rows. Use when user asks for "top X products", "best selling", lists, counts, or specific filtered data. Available entities: sales, products, customers, staff, suppliers, reviews, inventory, actions. Returns max 200 rows.',
    input_schema: {
      type: 'object',
      properties: {
        entity: { type: 'string', enum: ['sales', 'products', 'customers', 'staff', 'suppliers', 'reviews', 'inventory', 'actions'] },
        filters: { type: 'object', description: 'Filter criteria like {since: "2025-01-01", category: "drinks"}' },
        order_by: { type: 'string', description: 'Field to sort by' },
        order_direction: { type: 'string', enum: ['asc', 'desc'] },
        limit: { type: 'number', description: 'Max 200' },
      },
      required: ['entity'],
    },
  },
  {
    name: 'generate_report',
    description: 'Create a downloadable Excel (.xlsx) or CSV file. Use when user asks for "in excel", "as a report", "export", "create a file", "download". Returns a download_url the user can click.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Report title and filename' },
        entity: { type: 'string', enum: ['sales', 'products', 'customers', 'staff', 'suppliers', 'reviews', 'inventory'] },
        columns: { type: 'array', items: { type: 'string' }, description: 'Specific columns to include (optional)' },
        filters: { type: 'object' },
        order_by: { type: 'string' },
        limit: { type: 'number' },
        format: { type: 'string', enum: ['xlsx', 'csv'] },
      },
      required: ['title', 'entity'],
    },
  },
  {
    name: 'fetch_url',
    description: 'Fetch and read the content of a specific URL. Use when user gives you a link, or to read full articles from supplier/competitor sites. Returns plain text.',
    input_schema: {
      type: 'object',
      properties: { url: { type: 'string' } },
      required: ['url'],
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
    .neq('status', 'voided')
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
      total_revenue: rows.reduce((s, r) => s + (r.total_amount ?? 0), 0),
      total_transactions: rows.length,
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
    total_revenue: rows.reduce((s, r) => s + (r.total_amount ?? 0), 0),
    total_transactions: rows.length,
  };
}

async function queryInventory(
  input: { low_stock_only?: boolean; dead_stock_only?: boolean; limit?: number },
  businessId: string
): Promise<unknown> {
  const supabase = supabaseAdmin;
  const query = supabase
    .from('pos_products')
    .select('id, name, sku, stock_quantity, reorder_point, cost_price, retail_price, category')
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
    .select('id, name, email, phone, total_spend, total_spent, last_visit_at, last_visit, visit_count, segment, rfm_score_total, days_since_visit, created_at')
    .eq('business_id', businessId);

  if (input.segment) query = query.eq('segment', input.segment);
  if (input.search) {
    query = query.or(
      `name.ilike.%${input.search}%,email.ilike.%${input.search}%,phone.ilike.%${input.search}%`
    );
  }

  const sortCol =
    input.sort_by === 'ltv' ? 'total_spend' :
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

const ENTITY_TABLES: Record<string, { table: string; defaultColumns: string[]; defaultOrder: string }> = {
  sales:     { table: 'pos_sales', defaultColumns: ['id','total_amount','payment_method','created_at','status','customer_id'], defaultOrder: 'created_at' },
  products:  { table: 'pos_products', defaultColumns: ['id','name','sku','selling_price','cost_price','stock_quantity','category'], defaultOrder: 'name' },
  customers: { table: 'pos_customers', defaultColumns: ['id','name','phone','email','total_spent','visit_count','last_visit'], defaultOrder: 'total_spent' },
  staff:     { table: 'staff_members', defaultColumns: ['id','first_name','last_name','position','employment_type','pay_rate_cents','status'], defaultOrder: 'first_name' },
  suppliers: { table: 'pos_suppliers', defaultColumns: ['id','name','contact_name','email','phone','address'], defaultOrder: 'name' },
  reviews:   { table: 'google_reviews', defaultColumns: ['id','reviewer_name','rating','comment','review_date','has_reply'], defaultOrder: 'review_date' },
  inventory: { table: 'stock_movements', defaultColumns: ['id','product_id','movement_type','quantity_change','reason','scanned_at'], defaultOrder: 'scanned_at' },
  actions:   { table: 'aria_actions', defaultColumns: ['id','title','category','priority','status','created_at'], defaultOrder: 'created_at' },
};

async function queryBusinessData(input: Record<string, unknown>, businessId: string): Promise<unknown> {
  const entity = String(input.entity ?? '');
  const cfg = ENTITY_TABLES[entity];
  if (!cfg) return { error: `Unknown entity: ${entity}` };

  const filters = (input.filters ?? {}) as Record<string, unknown>;
  const orderBy = String(input.order_by ?? cfg.defaultOrder);
  const ascending = input.order_direction === 'asc';
  const limit = Math.min(Number(input.limit ?? 20), 200);

  let query = supabaseAdmin.from(cfg.table).select(cfg.defaultColumns.join(',')).eq('business_id', businessId);

  for (const [key, value] of Object.entries(filters)) {
    if (value == null) continue;
    if (key === 'since' && typeof value === 'string') query = query.gte('created_at', value);
    else if (key === 'until' && typeof value === 'string') query = query.lte('created_at', value);
    else if (key === 'min_amount' && typeof value === 'number') query = query.gte('total_amount', value);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    else query = query.eq(key, value as any);
  }

  if (entity === 'sales') query = query.neq('status', 'voided');

  query = query.order(orderBy, { ascending }).limit(limit);

  const { data, error } = await query;
  if (error) return { error: error.message, rows: [] };
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

async function fetchUrl(input: Record<string, unknown>): Promise<unknown> {
  const url = String(input.url ?? '');
  if (!url) return { error: 'url required' };
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Aria/1.0' }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const text = await res.text();
    const stripped = text
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 10000);
    return { ok: true, url, content: stripped };
  } catch (e) {
    return { error: String(e) };
  }
}

async function sendEmailNow(input: Record<string, unknown>): Promise<unknown> {
  const to = String(input.to ?? '');
  const subject = String(input.subject ?? '');
  const body = String(input.body ?? '');
  if (!to || !subject || !body) return { error: 'to, subject, body required' };
  if (!process.env.RESEND_API_KEY) return { error: 'RESEND_API_KEY not set' };

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
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!sid || !token || !from) return { error: 'Twilio not configured' };

  const phone = to.replace(/\s/g, '').replace(/^0/, '+61');
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: { 'Authorization': 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: phone, From: from, Body: message }).toString(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return { error: (err as Record<string, unknown>).message ?? 'SMS failed' };
  }
  return { ok: true, to: phone, message };
}

async function updateProductPrice(input: Record<string, unknown>, businessId: string): Promise<unknown> {
  const productId = String(input.product_id ?? '');
  const newPrice = Number(input.new_price ?? 0);
  if (!productId || newPrice <= 0) return { error: 'product_id and positive new_price required' };

  const { data: existing } = await supabaseAdmin.from('pos_products')
    .select('id, name, selling_price').eq('id', productId).eq('business_id', businessId).maybeSingle();
  if (!existing) return { error: 'Product not found' };

  const { error } = await supabaseAdmin.from('pos_products')
    .update({ selling_price: newPrice }).eq('id', productId).eq('business_id', businessId);
  if (error) return { error: error.message };
  return { ok: true, product: existing.name, old_price: existing.selling_price, new_price: newPrice };
}

async function generateImage(input: Record<string, unknown>, businessId: string): Promise<unknown> {
  const prompt = String(input.prompt ?? '');
  const size = String(input.size ?? '1024x1024');
  const style = (input.style === 'natural' ? 'natural' : 'vivid') as 'natural' | 'vivid';
  if (!prompt) return { error: 'prompt required' };
  if (!process.env.OPENAI_API_KEY) return { error: 'OPENAI_API_KEY not configured' };

  try {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'dall-e-3', prompt, n: 1, size, style, quality: 'standard', response_format: 'b64_json' }),
    });
    if (!res.ok) {
      const err = await res.text();
      return { error: 'Image generation failed: ' + err.slice(0, 200) };
    }
    const d = await res.json() as { data?: Array<{ b64_json?: string; revised_prompt?: string }> };
    const b64 = d.data?.[0]?.b64_json;
    if (!b64) return { error: 'No image returned' };

    // Upload to reports bucket
    const buf = Buffer.from(b64, 'base64');
    const filename = `image_${Date.now()}.png`;
    const path = `aria-images/${businessId}/${filename}`;
    const { error: upErr } = await supabaseAdmin.storage.from('reports').upload(path, buf, { contentType: 'image/png' });
    if (upErr) return { error: 'Upload failed: ' + upErr.message };

    const { data: signed } = await supabaseAdmin.storage.from('reports').createSignedUrl(path, 86400);
    return { ok: true, filename, download_url: signed?.signedUrl, format: 'png', revised_prompt: d.data?.[0]?.revised_prompt };
  } catch (e) {
    return { error: String(e) };
  }
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
    case 'query_online_orders': {
      const { period, status } = inp as { period: string; status?: string }
      const now = new Date()
      const from = period === 'today'
        ? new Date(new Date().setHours(0,0,0,0)).toISOString()
        : period === 'week'
        ? new Date(Date.now() - 7 * 86400000).toISOString()
        : new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
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
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
