import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { applyFeatureChoices } from '@/lib/industry-features-server';

// ONBOARD-FIX-1 (feature-set confirmation) — apply the owner's confirmed
// feature choices. applyFeatureChoices lives in src/lib/industry-features-server.ts
// (SETTINGS-FEATURES-1) so the settings Features tab can reuse the exact same
// read/write logic instead of drifting onto a second implementation.

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

  const abnRaw = ((form.abn as string) || '').replace(/\s/g, '');
  const abnEmpty = abnRaw.length === 0;
  const abnIsValid = !abnEmpty && !!abn_valid && validateABN((form.abn as string) || '');

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
    // ADDRESS-1 — structured lat/lng/place_id/formatted_address from Geoapify
    // autocomplete (Part B.2). Left null when the owner used manual entry.
    lat: form.lat ? Number(form.lat) : null,
    lng: form.lng ? Number(form.lng) : null,
    place_id: (form.place_id as string) || null,
    formatted_address: (form.formatted_address as string) || null,
    // year_established is an integer column — unlike lat/lng/weekly_revenue_target
    // (already guarded below), this was passed through as the raw form string
    // unconverted, so leaving it blank (a fully optional field, no validation
    // requires it) 500'd on submit with "invalid input syntax for type integer:
    // \"\"" — caught via ONBOARD-WIZARD-1's real fresh-onboard verification.
    year_established: form.year_established ? Number(form.year_established) || null : null,
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
  } else if (abnEmpty) {
    // No ABN provided — allow through; owner can add and verify later from Settings
    bizUpdate.access_status = 'active';
    bizUpdate.abn_verified = false;
  } else {
    // ABN entered but checksum failed — intentional fraud gate
    bizUpdate.access_status = 'pending_review';
    bizUpdate.access_blocked_reason = 'abn_validation_failed';
  }

  const { error: updateErr } = await supabaseAdmin
    .from('businesses')
    .update(bizUpdate)
    .eq('id', biz.id);
  if (updateErr) {
    // ABN-UNIQUE — server-side backstop behind the client-side check-abn call
    // (businesses_abn_unique partial index). Friendly message, not the raw
    // Postgres constraint-violation text.
    if (updateErr.code === '23505' && updateErr.message.includes('businesses_abn_unique')) {
      return NextResponse.json({ error: 'This ABN is already registered with Aria. If this is your business, contact support to request access.' }, { status: 409 })
    }
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  if (form.feature_choices && typeof form.feature_choices === 'object') {
    await applyFeatureChoices(biz.id, form.feature_choices as Record<string, boolean>)
  }

  await supabaseAdmin
    .from('business_onboarding')
    .upsert(
      {
        business_id: biz.id,
        user_id: user.id,
        current_step: 'provisioning',
        completed_steps: ['identity', 'abn', 'details', 'operations', 'features', 'products', 'goals'],
        provisioning_status: (!abnIsValid && !abnEmpty) ? 'blocked' : 'pending',
      },
      { onConflict: 'business_id' }
    );

  if (!abnIsValid && !abnEmpty) {
    // ABN was entered but failed checksum — route to review for manual verification
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
