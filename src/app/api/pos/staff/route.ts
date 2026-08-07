export const dynamic = 'force-dynamic';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture, withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'
import { staffPinColumns, isDuplicatePinError, isValidStaffPin } from '@/lib/pos/staff-pin'

// SECURITY-P1 (C-13) — POST/PATCH used to spread the whole request body directly into the DB
// write, so a client could set any column verbatim (role escalation, PIN tampering on colleagues).
// Explicit allowlist matching pos_staff's real columns (business_id/id/created_at are never
// client-settable — business_id comes from the session, id/created_at are DB-assigned).
//
// SEC-PIN-3 §1 — `pin` is NO LONGER IN THIS LIST, and that is the sprint's main find. SEC-PIN-2
// fixed three writers; this was a FOURTH, and the worst of them: the allowlist spread the raw PIN
// straight into the row and wrote neither pin_hash nor pin_lookup. So every staff member added
// through the inventory-team page was created PLAINTEXT-ONLY — the state the preflight reported as
// zero rows, which was true only because the existing five had been backfilled. A PIN now goes
// through staffPinColumns() like every other writer; the guard below keeps it out of the allowlist.
const STAFF_FIELDS = ['name', 'email', 'role', 'is_active', 'color', 'permissions'] as const
function pickStaffFields(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of STAFF_FIELDS) if (f in body) out[f] = body[f]
  return out
}

/**
 * Translate a client-supplied `pin` into the columns we actually store.
 * - absent          -> {} (leave whatever is there alone)
 * - '' / null       -> clear all three, which is how an owner REMOVES someone's PIN
 * - a 4-6 digit PIN -> pin_hash + pin_lookup, never plaintext
 * Returns a 400-shaped error for a malformed PIN rather than writing an unusable one.
 */
async function pinPatch(body: Record<string, unknown>, bid: string):
  Promise<{ cols: Record<string, unknown> } | { error: string }> {
  if (!('pin' in body)) return { cols: {} }
  const raw = body.pin
  if (raw === null || raw === '') return { cols: { pin: null, pin_hash: null, pin_lookup: null } }
  if (!isValidStaffPin(String(raw))) {
    return { error: 'PIN must be 4-6 digits and not an obvious sequence or repeat.' }
  }
  return { cols: { ...(await staffPinColumns(bid, String(raw))) } }
}

/** The row shape sent to the browser. Strips the credential columns and replaces them with the one
 *  fact the UI actually needs — whether this person can log in. Every other column is passed through
 *  untouched, so nothing the page renders today is lost. */
function safeStaff(row: Record<string, unknown>): Record<string, unknown> {
  const { pin: _pin, pin_hash, pin_lookup: _lk, ...rest } = row
  return { ...rest, has_pin: pin_hash != null }
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
  // SEC-PIN-3 §1 — this list feeds dashboard/staff/inventory-team, so before today the plaintext PIN
  // of every staff member was sent to the owner's BROWSER on page load. has_pin carries the same
  // information the page derived from it, without the credential.
  return NextResponse.json({ staff: (data ?? []).map(s => safeStaff(s as Record<string, unknown>)) });
}

async function _POST(req: Request, _ctx: unknown, { supabase, businessId: bid }: BusinessContext) {
  const body = await req.json();
  if (!body.name) return NextResponse.json({ error: 'name required' }, { status: 400 });
  const pinCols = await pinPatch(body, bid);
  if ('error' in pinCols) return NextResponse.json({ error: pinCols.error }, { status: 400 });
  const { data, error } = await supabase.from('pos_staff')
    .insert({ ...pickStaffFields(body), ...pinCols.cols, business_id: bid }).select().single();
  if (isDuplicatePinError(error)) {
    return NextResponse.json({ error: 'That PIN is already used by someone else here. Pick another.' }, { status: 409 });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ staff_member: safeStaff(data as Record<string, unknown>) });
}

async function _PATCH(req: Request, _ctx: unknown, { supabase, businessId: bid }: BusinessContext) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const body = await req.json();
  const pinCols = await pinPatch(body, bid);
  if ('error' in pinCols) return NextResponse.json({ error: pinCols.error }, { status: 400 });
  const { error } = await supabase.from('pos_staff')
    .update({ ...pickStaffFields(body), ...pinCols.cols }).eq('id', id).eq('business_id', bid);
  if (isDuplicatePinError(error)) {
    return NextResponse.json({ error: 'That PIN is already used by someone else here. Pick another.' }, { status: 409 });
  }
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
