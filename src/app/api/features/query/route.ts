export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

const ALLOWED_TABLES = new Set([
  'pos_sales', 'pos_sale_items', 'pos_commissions', 'pos_customers',
  'pos_products', 'pos_timesheets', 'warehouse_lots', 'warehouse_grns',
  'staff_members',
]);

type DateRange = 'today' | 'this_week' | 'this_month' | 'last_month' | 'last_7_days' | 'last_30_days' | 'all_time';

function dateRange(range: DateRange | string | undefined): { gte?: string; lt?: string } {
  const now = new Date();
  const pad  = (n: number) => String(n).padStart(2, '0');
  const ymd  = (d: Date)   => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

  if (range === 'today')       return { gte: ymd(now) + 'T00:00:00', lt: ymd(now) + 'T23:59:59' };
  if (range === 'last_7_days') { const s = new Date(now); s.setDate(s.getDate() - 7); return { gte: ymd(s) + 'T00:00:00' }; }
  if (range === 'last_30_days'){ const s = new Date(now); s.setDate(s.getDate() - 30); return { gte: ymd(s) + 'T00:00:00' }; }
  if (range === 'this_week')   { const s = new Date(now); s.setDate(s.getDate() - s.getDay()); return { gte: ymd(s) + 'T00:00:00' }; }
  if (range === 'this_month')  return { gte: `${now.getFullYear()}-${pad(now.getMonth()+1)}-01T00:00:00` };
  if (range === 'last_month')  {
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last  = new Date(now.getFullYear(), now.getMonth(), 1);
    return { gte: ymd(first) + 'T00:00:00', lt: ymd(last) + 'T00:00:00' };
  }
  return {};
}

interface QueryConfig {
  table:        string;
  type:         'sum' | 'count' | 'group_sum' | 'count_per_customer' | 'rows';
  field?:       string;
  group_field?: string;
  filters?:     Record<string, unknown>;
  date_field?:  string;
  date_range?:  string;
  order_by?:    string;
  order_dir?:   'asc' | 'desc';
  limit?:       number;
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { business_id, query }: { business_id: string; query: QueryConfig } = await req.json().catch(() => ({}));
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });
  if (!query?.table) return NextResponse.json({ error: 'query.table required' }, { status: 400 });

  // Verify ownership
  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).maybeSingle();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Whitelist table
  if (!ALLOWED_TABLES.has(query.table)) {
    return NextResponse.json({ error: `Table '${query.table}' not permitted` }, { status: 400 });
  }

  try {
    const { gte, lt } = dateRange(query.date_range as DateRange);
    const dateCol = query.date_field ?? 'created_at';

    let q = supabase.from(query.table).select(buildSelect(query)).eq('business_id', business_id);

    // Apply extra filters
    if (query.filters) {
      for (const [k, v] of Object.entries(query.filters)) {
        if (v !== undefined && v !== null) q = q.eq(k, v as string | number | boolean);
      }
    }

    // Date range
    if (gte) q = q.gte(dateCol, gte);
    if (lt)  q = q.lt(dateCol, lt);

    // Ordering
    const orderDir = query.order_dir === 'asc';
    if (query.order_by) q = q.order(query.order_by, { ascending: orderDir });
    else if (query.type === 'group_sum' && query.field) {
      // count_per_customer: skip server-side order — aggregation+sorting done in aggregate()
      q = q.order(query.field, { ascending: false });
    }

    if (query.limit) q = q.limit(query.limit);

    const { data, error } = await q;
    if (error) {
      // Table or column doesn't exist — return empty result rather than 500
      if (error.code === '42P01' || error.code === '42703') {
        return NextResponse.json({ result: [] });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const result = aggregate(query, (data ?? []) as unknown as Record<string, unknown>[]);
    return NextResponse.json({ result });
  } catch (e) {
    console.error('[features/query]', e);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
}

function buildSelect(q: QueryConfig): string {
  if (q.type === 'sum' && q.field)   return q.field;
  if (q.type === 'count')            return 'id';
  if (q.type === 'group_sum')        return `${q.group_field ?? 'name'},${q.field ?? 'amount'}`;
  if (q.type === 'count_per_customer') return 'customer_id,customer_name';
  if (q.type === 'rows') {
    if (q.field) return q.field;
    return '*';
  }
  return '*';
}

function aggregate(q: QueryConfig, rows: Record<string, unknown>[]): unknown {
  if (q.type === 'sum') {
    return rows.reduce((acc, r) => acc + (Number(r[q.field ?? 'amount']) || 0), 0);
  }
  if (q.type === 'count') {
    return rows.length;
  }
  if (q.type === 'group_sum') {
    const grouped: Record<string, number> = {};
    for (const r of rows) {
      const key = String(r[q.group_field ?? 'name'] ?? 'Unknown');
      grouped[key] = (grouped[key] ?? 0) + (Number(r[q.field ?? 'amount']) || 0);
    }
    return Object.entries(grouped)
      .sort(([, a], [, b]) => b - a)
      .slice(0, q.limit ?? 10)
      .map(([name, value]) => ({ name, value }));
  }
  if (q.type === 'count_per_customer') {
    const grouped: Record<string, { name: string; count: number }> = {};
    for (const r of rows) {
      const id   = String(r['customer_id'] ?? r['id']);
      const name = String(r['customer_name'] ?? 'Unknown');
      if (!grouped[id]) grouped[id] = { name, count: 0 };
      grouped[id].count++;
    }
    return Object.values(grouped)
      .sort((a, b) => b.count - a.count)
      .slice(0, q.limit ?? 20)
      .map(({ name, count }) => ({ name, value: count }));
  }
  // rows — return as-is
  return rows;
}

export const POST = withErrorCapture('features/query', _POST)
