export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { getBid } from '@/lib/auth/get-bid'

// H-17 — POST used to spread the whole request body directly into update()/insert(), so a
// client could set any column verbatim (business_id override, etc). Explicit allowlist matching
// pos_online_settings' real live columns, verified via information_schema against prod (no
// tracked migration creates this table, so the file-based source used for the other 3 routes in
// this sprint wasn't available — confirmed instead against the live DB and cross-checked against
// src/types/database.types.ts, which agrees). business_id/id/created_at/updated_at are never
// client-settable.
const ONLINE_SETTINGS_FIELDS = ['enabled', 'store_name', 'store_slug', 'accept_orders', 'delivery_enabled', 'pickup_enabled', 'min_order_amount', 'delivery_fee', 'delivery_radius_km', 'prep_time_minutes', 'settings'] as const
function pickOnlineSettingsFields(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of ONLINE_SETTINGS_FIELDS) if (f in body) out[f] = body[f]
  return out
}

async function _GET() {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ settings: null });

  const { data } = await supabase.from('pos_online_settings').select('*').eq('business_id', bid).maybeSingle();
  return NextResponse.json({ settings: data });
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 400 });

  const body = await req.json();
  const fields = pickOnlineSettingsFields(body);
  const { data: existing } = await supabase.from('pos_online_settings').select('id').eq('business_id', bid).maybeSingle();

  let error;
  if (existing) {
    ({ error } = await supabase.from('pos_online_settings').update(fields).eq('business_id', bid));
  } else {
    ({ error } = await supabase.from('pos_online_settings').insert({ ...fields, business_id: bid }));
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export const GET = withErrorCapture('pos/online', _GET)
export const POST = withErrorCapture('pos/online', _POST)
