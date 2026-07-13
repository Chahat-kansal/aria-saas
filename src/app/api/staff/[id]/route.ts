import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// SECURITY-P1 (H-14) — same allowlist as src/app/api/staff/route.ts's POST (kept in sync manually;
// see that file's comment for the full rationale on which fields are deliberately excluded).
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

async function verifyStaff(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  userId: string,
  staffId: string
) {
  const { data } = await supabase
    .from('staff_members')
    .select('id, business_id, businesses!inner(user_id)')
    .eq('id', staffId)
    .single();
  if (!data) return null;
  if ((data.businesses as any).user_id !== userId) return null;
  return data;
}

async function _GET(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const record = await verifyStaff(supabase, user.id, params.id);
  if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Full profile including sensitive fields (single-record GET only)
  const [staffRes, docsRes, leaveRes] = await Promise.all([
    supabase.from('staff_members').select('*').eq('id', params.id).single(),
    supabase.from('staff_documents').select('*').eq('staff_id', params.id).order('uploaded_at', { ascending: false }),
    supabase.from('staff_leave').select('*').eq('staff_id', params.id).order('start_date', { ascending: false }),
  ]);

  return NextResponse.json({
    staff: staffRes.data,
    documents: docsRes.data ?? [],
    leave: leaveRes.data ?? [],
  });
}

async function _PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const record = await verifyStaff(supabase, user.id, params.id);
  if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const updates = { ...pickStaffFields(body), updated_at: new Date().toISOString() };

  const { data, error: e } = await supabase.from('staff_members')
    .update(updates)
    .eq('id', params.id)
    .select('*')
    .single();
  if (e) return NextResponse.json({ error: e.message }, { status: 500 });
  return NextResponse.json({ staff: data });
}

async function _DELETE(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const record = await verifyStaff(supabase, user.id, params.id);
  if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Soft delete
  await supabase.from('staff_members').update({
    status: 'terminated',
    end_date: new Date().toISOString().split('T')[0],
    updated_at: new Date().toISOString(),
  }).eq('id', params.id);

  return NextResponse.json({ ok: true });
}

export const GET = withErrorCapture('staff/[id]', _GET)
export const PATCH = withErrorCapture('staff/[id]', _PATCH)
export const DELETE = withErrorCapture('staff/[id]', _DELETE)
