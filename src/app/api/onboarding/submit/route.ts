import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';

function validateABN(raw: string): boolean {
  const digits = raw.replace(/\s/g, '');
  if (digits.length !== 11) return false;
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const d = digits.split('').map(Number);
  if (d.some(n => isNaN(n))) return false;
  d[0] -= 1;
  const sum = d.reduce((acc, v, i) => acc + v * weights[i], 0);
  return sum % 89 === 0;
}

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { form, abn_valid } = body as { form: Record<string, unknown>; abn_valid: boolean };

  const abnIsValid = !!abn_valid && validateABN((form.abn as string) || '');

  const { data: biz } = await supabaseAdmin
    .from('businesses')
    .select('id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 });

  const bizUpdate: Record<string, unknown> = {
    name: (form.trading_name as string) || (form.legal_name as string) || 'My Business',
    legal_name: form.legal_name,
    trading_name: form.trading_name,
    owner_name: form.owner_name,
    email: form.email,
    phone: form.phone,
    entity_type: form.entity_type,
    abn: form.abn,
    acn: form.acn,
    gst_registered: form.gst_registered === 'yes',
    industry: form.industry,
    industry_subtype: form.industry_subtype,
    address: form.address,
    city: form.city,
    business_state: form.business_state,
    postcode: form.postcode,
    year_established: form.year_established,
    staff_count: form.staff_count,
    monthly_revenue: form.monthly_revenue,
    website: form.website,
    google_business_url: form.google_business_url,
    biggest_challenge: Array.isArray(form.biggest_challenge)
      ? (form.biggest_challenge as string[]).join(', ')
      : (form.biggest_challenge as string) || '',
    business_model: (form.business_model as string) || 'product',
    pos_enabled: (form.business_model as string) !== 'service',
    // PP STEP 3 / I2 — capture the owner's weekly revenue goal (skippable → 0)
    weekly_revenue_target: (() => {
      const n = Number(form.weekly_revenue_target)
      return Number.isFinite(n) && n > 0 ? Math.min(Math.round(n * 100) / 100, 9_999_999) : 0
    })(),
  };

  if (abnIsValid) {
    bizUpdate.access_status = 'active';
    bizUpdate.abn_status = 'active';
    bizUpdate.abn_verified = true;
    bizUpdate.abn_verified_at = new Date().toISOString();
    bizUpdate.abn_verification_method = 'checksum';
  } else {
    bizUpdate.access_status = 'pending_review';
    bizUpdate.access_blocked_reason = 'abn_validation_failed';
  }

  const { error: updateErr } = await supabaseAdmin
    .from('businesses')
    .update(bizUpdate)
    .eq('id', biz.id);
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  await supabaseAdmin
    .from('business_onboarding')
    .upsert(
      {
        business_id: biz.id,
        user_id: user.id,
        current_step: 'provisioning',
        completed_steps: ['identity', 'abn', 'details', 'operations', 'goals'],
        provisioning_status: abnIsValid ? 'pending' : 'blocked',
      },
      { onConflict: 'business_id' }
    );

  if (!abnIsValid) {
    await supabaseAdmin
      .from('business_review_requests')
      .insert({
        business_id: biz.id,
        user_id: user.id,
        reason: 'abn_validation_failed',
        submitted_abn: (form.abn as string) || null,
        submitted_acn: (form.acn as string) || null,
        status: 'pending',
      });
    return NextResponse.json({ route: 'review' });
  }

  return NextResponse.json({ route: 'provisioning' });
}
