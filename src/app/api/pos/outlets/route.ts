export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { getBid } from '@/lib/auth/get-bid'
import { trackUsage } from '@/lib/track-usage';

// H-17 — POST/PATCH used to spread the whole request body directly into the DB write, so a
// client could set any column verbatim. Explicit allowlist matching pos_outlets' real columns
// (confirmed live via information_schema — id/business_id/created_at are never client-settable).
// stripe_account_id is deliberately excluded — payout routing must only ever be set via a
// dedicated Stripe Connect OAuth flow, never a raw client body (classic mass-assignment payout
// hijack vector). is_global is deliberately excluded — no legitimate client write path exists
// for this system default-outlet flag today.
const OUTLET_FIELDS = [
  'name', 'address', 'phone', 'code', 'timezone', 'is_active', 'active', 'is_default',
  'accepts_online_orders', 'online_order_throttle_per_15min', 'pickup_ready_estimate_minutes',
  'tax_jurisdiction', 'tax_inclusive_pricing', 'state_code',
  'delivery_enabled', 'delivery_radius_km', 'delivery_fee', 'min_order_amount', 'prep_time_minutes',
  'online_ordering_note', 'suburb', 'state', 'postcode', 'country', 'lat', 'lng',
  'formatted_address', 'place_id',
] as const
function pickOutletFields(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of OUTLET_FIELDS) if (f in body) out[f] = body[f]
  return out
}

async function _GET() {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ outlets: [] });

  const { data } = await supabase.from('pos_outlets').select('*').eq('business_id', bid).order('name');
  return NextResponse.json({ outlets: data || [] });
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 400 });

  const body = await req.json();

  // MS14 PHASE 2 — plan limit gate, INERT BY DEFAULT. With ARIA_LIMITS_ENFORCE unset (the
  // shipped state) checkLimit returns allowed before any I/O, so this block costs nothing and
  // changes nothing. Armed, it refuses with the limit, the count and the tier that lifts it.
  {
    const { checkLimit } = await import('@/lib/billing/enforce-limits');
    const { count: outletCount } = await supabase.from('pos_outlets')
      .select('id', { count: 'exact', head: true }).eq('business_id', bid);
    const gate = await checkLimit({ businessId: bid, key: 'outlets', current: outletCount ?? 0 });
    if (!gate.allowed) return NextResponse.json({ error: 'plan_limit', message: gate.reason }, { status: 403 });
  }

  const { data: outlet, error } = await supabase.from('pos_outlets').insert({ ...pickOutletFields(body), business_id: bid }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // MS14 PHASE 3 — meter the event the limit is about. Fire-and-forget: never awaited, never
  // able to fail this request. Counts only — no names, no addresses.
  trackUsage({ business_id: bid, event_type: 'outlet_created' });

  // Auto-create a default register for every new outlet
  await supabase.from('pos_registers').insert({
    business_id: bid,
    outlet_id: outlet.id,
    name: 'Main Register',
    is_active: true,
  });

  return NextResponse.json({ outlet });
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const body = await req.json();
  const { error } = await supabase.from('pos_outlets').update(pickOutletFields(body)).eq('id', id).eq('business_id', bid);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

async function _DELETE(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { error } = await supabase.from('pos_outlets').delete().eq('id', id).eq('business_id', bid);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export const GET = withErrorCapture('pos/outlets', _GET)
export const POST = withErrorCapture('pos/outlets', _POST)
export const PATCH = withErrorCapture('pos/outlets', _PATCH)
export const PUT = withErrorCapture('pos/outlets', _PATCH)
export const DELETE = withErrorCapture('pos/outlets', _DELETE)
