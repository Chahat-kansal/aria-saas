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

type KdsStatus = 'fired' | 'in_progress' | 'ready' | 'bumped';

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

  const validStatuses: KdsStatus[] = ['fired', 'in_progress', 'ready', 'bumped'];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const updates: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (status === 'ready' || status === 'bumped') {
    updates.bumped_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('pos_kds_tickets')
    .update(updates)
    .eq('id', id)
    .eq('business_id', bid);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export const PATCH = withErrorCapture('pos/kds/[id]', _PATCH)
