export const dynamic = 'force-dynamic';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture, withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'

// SECURITY-P1 (C-13) — POST/PATCH used to spread the whole request body directly into the DB
// write, so a client could set any column verbatim (role escalation, PIN tampering on colleagues).
// Explicit allowlist matching pos_staff's real columns (business_id/id/created_at are never
// client-settable — business_id comes from the session, id/created_at are DB-assigned).
const STAFF_FIELDS = ['name', 'email', 'pin', 'role', 'is_active', 'color', 'permissions'] as const
function pickStaffFields(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of STAFF_FIELDS) if (f in body) out[f] = body[f]
  return out
}

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle();
  return data?.id ?? null;
}

async function _GET() {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ staff: [] });
  const { data } = await supabase.from('pos_staff').select('*').eq('business_id', bid).order('name');
  return NextResponse.json({ staff: data ?? [] });
}

async function _POST(req: Request, _ctx: unknown, { supabase, businessId: bid }: BusinessContext) {
  const body = await req.json();
  if (!body.name) return NextResponse.json({ error: 'name required' }, { status: 400 });
  const { data, error } = await supabase.from('pos_staff').insert({ ...pickStaffFields(body), business_id: bid }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ staff_member: data });
}

async function _PATCH(req: Request, _ctx: unknown, { supabase, businessId: bid }: BusinessContext) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const body = await req.json();
  const { error } = await supabase.from('pos_staff').update(pickStaffFields(body)).eq('id', id).eq('business_id', bid);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

async function _DELETE(req: Request, _ctx: unknown, { supabase, businessId: bid }: BusinessContext) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  await supabase.from('pos_staff').delete().eq('id', id).eq('business_id', bid);
  return NextResponse.json({ ok: true });
}

export const GET = withErrorCapture('pos/staff', _GET)
export const POST = withBusinessContext('pos/staff', _POST)
export const PATCH = withBusinessContext('pos/staff', _PATCH)
export const DELETE = withBusinessContext('pos/staff', _DELETE)
