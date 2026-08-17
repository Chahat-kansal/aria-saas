export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { verifyBusinessAccess } from '@/lib/auth/verify-business-access'
import { encryptCustomerPII } from '@/lib/aria/customer-pii'
import { toE164AU } from '@/lib/phone'
import { linkLoyaltyIdentity } from '@/lib/loyalty/link-identity'
import { logger } from '@/lib/observability/logger'

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

  // S-PHONE-E164 — normalise BEFORE the duplicate check and the insert. A raw check compared
  // 0412345678 against a stored +61412345678 and found nothing, so the "duplicate phone" guard
  // below waved through the exact duplicate it exists to stop.
  const e164Phone = phone ? (toE164AU(phone) ?? phone) : phone;

  // Duplicate phone check
  if (phone) {
    const { data: existingPhone } = await supabase.from('pos_customers')
      .select('id').eq('business_id', bid).eq('phone', e164Phone).maybeSingle();
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
      email: email || null, phone: e164Phone || null,
      birthday: birthday || null, notes: notes || null,
      // SEC-4 — dual-write encrypted PII alongside retained plaintext
      ...encryptCustomerPII({ name, email: email || null, phone: e164Phone || null, notes: notes || null }, bid),
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

  // ARIA-LOYALTY-FIX-1 §1 — a customer added at the till now gets a loyalty identity, the same
  // find-or-create the public enrol route uses. Before this, only self-enrollers and self-sign-ins
  // ever got one, so counter enrolment — the way cafés actually enrol people — built no loyalty
  // base: 48 of Sip's 51 customers are unlinked.
  //
  // AFTER the insert and fully swallowed: the customer already exists at this point, and a loyalty
  // bookkeeping failure must never be the reason a cashier cannot add someone mid-sale. Awaited
  // rather than fire-and-forget because a serverless invocation can end before a floating promise
  // resolves — two short queries is the right price for the link actually being written.
  const link = await linkLoyaltyIdentity(supabase, {
    customerId: customer.id as string,
    email: email || null,
    phone: e164Phone || null,
  });
  if (link.reason === 'no_contact') {
    // Name-only record: nothing to identify this person by across venues. Expected, not an error.
    logger.info('pos/customers created without loyalty identity (no phone or email)', { businessId: bid });
  } else if (link.reason === 'failed') {
    logger.warn('pos/customers loyalty identity link failed (non-fatal)', { businessId: bid });
  } else if (link.reason === 'identity_taken') {
    // ARIA-LOYALTY-CLOSEOUT-1 §1 — pos_customers_identity_uniq rejected the link: this person
    // already has a live customer row here, reached by a contact detail the duplicate-phone and
    // duplicate-email guards above did not match (they compare one field each; the identity matches
    // on email OR phone, so an existing row found by phone blocks a new row given only that email).
    //
    // THE CASHIER'S FLOW IS UNAFFECTED, DELIBERATELY. The customer row was already inserted and is
    // returned exactly as before — a 200 with the customer, same shape, same status. Refusing the
    // sale over loyalty bookkeeping would be the worse bug, and the row is a real, usable customer
    // that is merely unlinked. The duplicate is surfaced, not enforced: logged for the owner, and
    // echoed as loyalty_duplicate_of so a caller CAN offer "use the existing customer" later.
    logger.warn('pos/customers loyalty identity already held by another live customer', {
      businessId: bid, identityId: link.identityId, heldBy: link.heldByCustomerId,
    });
    return NextResponse.json({ customer, loyalty_duplicate_of: link.heldByCustomerId });
  }

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
