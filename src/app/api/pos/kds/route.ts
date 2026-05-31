export const dynamic = 'force-dynamic';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle();
  return data?.id ?? null;
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ orders: [] });

  const { searchParams } = new URL(req.url);
  const includeAll = searchParams.get('all') === 'true';

  let query = supabase
    .from('pos_kds_orders')
    .select('*')
    .eq('business_id', bid)
    .order('created_at', { ascending: true });

  if (!includeAll) {
    // Only active statuses; exclude orders older than 24h (stale multi-day orders)
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    query = query
      .in('status', ['new', 'in_progress', 'ready'])
      .gte('created_at', cutoff);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Map table_number → table_label so kitchen page KDSOrder interface is satisfied
  const orders = (data ?? []).map((o: Record<string, unknown>) => ({
    ...o,
    table_label: o.table_number ?? null,
    ticket_number: o.ticket_number ?? null,
  }));
  return NextResponse.json({ orders });
}

export const GET = withErrorCapture('pos/kds', _GET)

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });

  const body = await req.json();
  const { sale_id, table_number, items, notes, priority = 1 } = body;

  const { data, error } = await supabase.from('pos_kds_orders').insert({
    business_id: bid,
    sale_id: sale_id ?? null,
    table_number: table_number ?? null,
    items: items ?? [],
    status: 'new',
    priority,
    notes: notes ?? null,
    created_at: new Date().toISOString(),
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ order: data });
}

export const POST = withErrorCapture('pos/kds', _POST)
