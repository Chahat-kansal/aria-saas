import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function verifyBiz(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string, bid: string) {
  const { data } = await supabase.from('businesses').select('id').eq('id', bid).eq('user_id', userId).single();
  return data?.id ?? null;
}

// Columns safe to return in list (excludes sensitive fields)
const LIST_SELECT = `id, business_id, first_name, last_name, preferred_name, profile_photo_url,
  position, department, employment_type, status, start_date, end_date,
  right_to_work_verified, visa_type, visa_expiry_date, mobile, work_email, created_at`;

// SECURITY-P1 (H-14) — insert used to spread the whole request body, so a client could set
// portal_enabled, right_to_work_verified, visa fields etc directly with no verification workflow.
// Explicit allowlist of legitimate staff-editable fields; business_id/id/created_at/updated_at are
// never client-settable, and portal_enabled/right_to_work_verified/right_to_work_verified_date are
// deliberately excluded per the audit's fix pattern (they need a verification workflow, not a raw
// client toggle) along with the portal session-security columns and system-computed YTD payroll totals.
const STAFF_FIELDS = [
  'first_name', 'last_name', 'preferred_name', 'date_of_birth', 'gender', 'profile_photo_url',
  'personal_email', 'work_email', 'mobile', 'emergency_contact_name', 'emergency_contact_phone',
  'emergency_contact_relationship', 'position', 'department', 'employment_type', 'start_date',
  'end_date', 'status', 'pay_type', 'pay_rate_cents', 'pay_per_annum_cents', 'pay_frequency',
  'superannuation_rate', 'tax_file_number', 'bank_account_name', 'bank_bsb', 'bank_account_number',
  'visa_type', 'visa_subclass', 'visa_expiry_date', 'visa_work_restrictions', 'passport_country',
  'passport_expiry_date', 'notes', 'custom_fields', 'color', 'bank_account', 'tax_free_threshold',
  'name', 'award_classification', 'base_rate_cents', 'saturday_multiplier', 'sunday_multiplier',
  'ph_multiplier', 'overtime_multiplier', 'leave_balance_days', 'personal_leave_balance_days',
  'hourly_rate',
] as const;
function pickStaffFields(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of STAFF_FIELDS) if (f in body) out[f] = body[f];
  return out;
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const business_id = searchParams.get('business_id');
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });
  if (!await verifyBiz(supabase, user.id, business_id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const status = searchParams.get('status');
  let query = supabase.from('staff_members')
    .select(LIST_SELECT)
    .eq('business_id', business_id)
    .order('first_name');
  if (status && status !== 'all') query = query.eq('status', status);

  const { data, error: e } = await query;
  if (e) return NextResponse.json({ error: e.message }, { status: 500 });
  return NextResponse.json({ staff: data ?? [] });
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { business_id } = body;
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });
  if (!await verifyBiz(supabase, user.id, business_id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (!body.first_name || !body.last_name || !body.position) {
    return NextResponse.json({ error: 'first_name, last_name, position required' }, { status: 400 });
  }

  const { data, error: e } = await supabase.from('staff_members')
    .insert({ ...pickStaffFields(body), business_id, updated_at: new Date().toISOString() })
    .select(LIST_SELECT)
    .single();
  if (e) return NextResponse.json({ error: e.message }, { status: 500 });
  return NextResponse.json({ staff: data });
}

export const GET = withErrorCapture('staff', _GET)
export const POST = withErrorCapture('staff', _POST)
