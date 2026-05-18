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

type KdsStatus = 'new' | 'in_progress' | 'ready' | 'delivered' | 'void' | 'fired' | 'bumped';

// GET /api/pos/kds/[station] — returns open tickets for a station (Sprint F)
async function _GET(_req: Request, { params }: { params: Promise<{ id: string }> | { id: string } }) {
  const { id: station } = 'then' in params ? await params : params
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ tickets: [] });

  let q = supabase
    .from('pos_kds_tickets')
    .select('id, station, course, seat_number, status, fired_at, bumped_at, prep_time_seconds, sale_id, sale_item_id, pos_sales ( sale_number, order_type, customer_name, cover_count, notes ), pos_sale_items ( product_name, variant_label, quantity, modifiers, item_notes, seat_number, course )')
    .eq('business_id', bid)
    .in('status', ['fired', 'in_progress'])
    .order('course', { ascending: true, nullsFirst: false })
    .order('fired_at', { ascending: true })
    .limit(200)

  if (station !== 'all') q = q.eq('station', station)

  const { data: tickets } = await q
  return NextResponse.json({ tickets: tickets ?? [] })
}

export const GET = withErrorCapture('pos/kds/[id]', _GET)

async function _PATCH(req: Request, { params }: { params: Promise<{ id: string }> | { id: string } }) {
  const { id } = 'then' in params ? await params : params;
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 400 });

  const { status }: { status: KdsStatus } = await req.json();
  if (!status) return NextResponse.json({ error: 'status required' }, { status: 400 });

  const validStatuses: KdsStatus[] = ['new', 'in_progress', 'ready', 'delivered', 'void', 'fired', 'bumped'];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const now = new Date().toISOString()
  // pos_kds_orders has no updated_at — build a separate, column-safe update object
  const ordersUpdate: Record<string, unknown> = { status }
  if (status === 'in_progress') ordersUpdate.started_at = now
  if (status === 'ready' || status === 'bumped') ordersUpdate.bumped_at = now
  if (status === 'delivered') { ordersUpdate.bumped_at = now; ordersUpdate.completed_at = now }

  const { error: e1, data: d1 } = await supabase
    .from('pos_kds_orders')
    .update(ordersUpdate)
    .eq('id', id)
    .eq('business_id', bid)
    .select('id')

  if (!e1 && d1 && d1.length > 0) return NextResponse.json({ ok: true })

  // pos_kds_tickets does have updated_at
  const updates: Record<string, unknown> = { status, updated_at: now }
  if (status === 'delivered' || status === 'bumped' || status === 'ready') updates.bumped_at = now

  const { error } = await supabase
    .from('pos_kds_tickets')
    .update(updates)
    .eq('id', id)
    .eq('business_id', bid);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export const PATCH = withErrorCapture('pos/kds/[id]', _PATCH)
