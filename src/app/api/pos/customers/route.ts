export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { verifyBusinessAccess } from '@/lib/auth/verify-business-access'
import { encryptCustomerPII } from '@/lib/aria/customer-pii'

async function getBusinessId(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase
    .from('user_active_business')
    .select('business_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase
    .from('businesses')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q');
  const id = searchParams.get('id');
  const explicitBid = searchParams.get('business_id');

  // Use explicit business_id from POS terminal (staff PIN mode) or fall back to auth lookup
  const bid = explicitBid ?? await getBusinessId(supabase, user.id);
  if (!bid) return NextResponse.json({ customers: [] });
  const denied = await verifyBusinessAccess(user.id, bid);
  if (denied) return denied;

  // Fetch a single customer by ID
  if (id) {
    const { data: customer, error } = await supabase
      .from('pos_customers')
      .select('*')
      .eq('id', id)
      .eq('business_id', bid)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ customer: customer ?? null });
  }

  const { searchParams: sp } = new URL(req.url);
  const tag    = sp.get('tag');
  const sortBy = sp.get('sort') ?? 'last_visit_at';
  const limit  = Math.min(parseInt(sp.get('limit') ?? '50'), 200);
  const offset = parseInt(sp.get('offset') ?? '0');

  let query = supabase
    .from('pos_customers')
    .select('id, name, phone, email, birthday, tags, points_balance, stamps_count, loyalty_points, total_spent, visit_count, last_visit_at, last_visit, marketing_consent, sms_consent, email_consent, consent_source, consent_captured_at, notes, created_at')
    .eq('business_id', bid)
    .is('deleted_at', null)
    .range(offset, offset + limit - 1);

  if (sortBy === 'total_spent') query = query.order('total_spent', { ascending: false });
  else if (sortBy === 'visit_count') query = query.order('visit_count', { ascending: false });
  else query = query.order('last_visit_at', { ascending: false, nullsFirst: false });

  if (q) {
    query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`);
  }
  if (tag) {
    query = query.contains('tags', [tag]);
  }

  const { data: customers, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ customers: customers || [] });
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBusinessId(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 400 });

  const { name, email, phone, birthday, notes, tags, marketing_consent, sms_consent, email_consent, group_id, group_name, account_number } = await req.json();
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  // CONSENT-COLLECTION-1: capture express per-channel consent at add-time. The form's two opt-in
  // toggles arrive as sms_consent/email_consent (default OFF). Stamp provenance; keep the legacy
  // marketing_consent flag in sync (true if either channel opted in) for back-compat.
  const smsOptIn = !!sms_consent;
  const emailOptIn = !!email_consent;
  const anyOptIn = smsOptIn || emailOptIn;

  // Duplicate phone check
  if (phone) {
    const { data: existingPhone } = await supabase.from('pos_customers')
      .select('id').eq('business_id', bid).eq('phone', phone).maybeSingle();
    if (existingPhone) {
      return NextResponse.json({ error: 'customer_exists', customer_id: existingPhone.id, message: 'A customer with that phone number already exists' }, { status: 409 });
    }
  }

  if (email) {
    const { data: existing } = await supabase.from('pos_customers')
      .select('id').eq('business_id', bid).eq('email', email).maybeSingle();
    if (existing) {
      return NextResponse.json({ error: 'customer_exists', customer_id: existing.id }, { status: 409 });
    }
  }

  const { data: customer, error } = await supabase
    .from('pos_customers')
    .insert({
      business_id: bid, name,
      email: email || null, phone: phone || null,
      birthday: birthday || null, notes: notes || null,
      // SEC-4 — dual-write encrypted PII alongside retained plaintext
      ...encryptCustomerPII({ name, email: email || null, phone: phone || null, notes: notes || null }, bid),
      tags: tags ?? [],
      marketing_consent: !!marketing_consent || anyOptIn,
      sms_consent: smsOptIn, email_consent: emailOptIn,
      consent_captured_at: new Date().toISOString(), consent_source: 'pos_add',
      loyalty_points: 0, points_balance: 0, stamps_count: 0,
      total_spent: 0, visit_count: 0,
      group_id: group_id || null, group_name: group_name || null,
      account_number: account_number || null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ customer });
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBusinessId(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const body = await req.json();

  // CONSENT-COLLECTION-1: when an owner toggles a consent channel on the detail view, re-stamp
  // provenance (withdrawal as easy as giving) + keep the legacy marketing_consent flag in sync.
  const consentPatch: Record<string, unknown> = {};
  if ('sms_consent' in body || 'email_consent' in body) {
    const { data: cur } = await supabase.from('pos_customers')
      .select('sms_consent, email_consent').eq('id', id).eq('business_id', bid).maybeSingle();
    const newSms = 'sms_consent' in body ? !!body.sms_consent : !!cur?.sms_consent;
    const newEmail = 'email_consent' in body ? !!body.email_consent : !!cur?.email_consent;
    consentPatch.sms_consent = newSms;
    consentPatch.email_consent = newEmail;
    consentPatch.marketing_consent = newSms || newEmail;
    consentPatch.consent_captured_at = new Date().toISOString();
    consentPatch.consent_source = 'staff_update';
  }

  const { error } = await supabase
    .from('pos_customers')
    // SEC-4 — dual-write encrypted PII for any of email/phone/name/notes present in the update
    .update({ ...body, ...consentPatch, ...encryptCustomerPII(body, bid) })
    .eq('id', id)
    .eq('business_id', bid);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export const GET = withErrorCapture('pos/customers', _GET)
export const POST = withErrorCapture('pos/customers', _POST)
export const PATCH = withErrorCapture('pos/customers', _PATCH)
