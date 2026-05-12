export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const business_id = searchParams.get('business_id');
  const status = searchParams.get('status') ?? 'pending';
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 100);

  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const { data: biz } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', business_id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let query = supabase
    .from('missed_demand')
    .select('*')
    .eq('business_id', business_id)
    .order('last_requested_at', { ascending: false })
    .limit(limit);

  if (status !== 'all') {
    query = query.eq('status', status);
  }

  const { data: items, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ items: items ?? [] });
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const {
    business_id,
    product_name,
    product_barcode,
    product_category,
    global_product_id,
    logged_by,
    customer_id,
    customer_note,
    estimated_quantity_wanted = 1,
    approximate_price_point_cents,
  } = body;

  if (!business_id || !product_name) {
    return NextResponse.json({ error: 'business_id and product_name required' }, { status: 400 });
  }

  const { data: biz } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', business_id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Check for existing pending record for same product (deduplicate)
  const normalised = product_name.trim().toLowerCase();
  let matchQuery = supabase
    .from('missed_demand')
    .select('id, times_requested, estimated_quantity_wanted')
    .eq('business_id', business_id)
    .in('status', ['pending', 'analysed', 'suggested']);

  if (product_barcode) {
    matchQuery = matchQuery.eq('product_barcode', product_barcode);
  } else {
    matchQuery = matchQuery.ilike('product_name', normalised);
  }

  const { data: existing } = await matchQuery.maybeSingle();

  if (existing) {
    const { data: updated } = await supabase
      .from('missed_demand')
      .update({
        times_requested: (existing.times_requested ?? 1) + 1,
        estimated_quantity_wanted: (existing.estimated_quantity_wanted ?? 1) + (estimated_quantity_wanted ?? 1),
        last_requested_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select()
      .maybeSingle();
    return NextResponse.json({ item: updated, deduplicated: true });
  }

  const { data: created, error: insertErr } = await supabase
    .from('missed_demand')
    .insert({
      business_id,
      product_name: product_name.trim(),
      product_barcode: product_barcode ?? null,
      product_category: product_category ?? null,
      global_product_id: global_product_id ?? null,
      logged_by: logged_by ?? null,
      customer_id: customer_id ?? null,
      customer_note: customer_note ?? null,
      estimated_quantity_wanted,
      approximate_price_point_cents: approximate_price_point_cents ?? null,
      times_requested: 1,
      status: 'pending',
      first_requested_at: new Date().toISOString(),
      last_requested_at: new Date().toISOString(),
    })
    .select()
    .maybeSingle();

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });
  return NextResponse.json({ item: created, deduplicated: false }, { status: 201 });
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { id, business_id, status, aria_analysis, aria_confidence, estimated_monthly_revenue_cents } = body;

  if (!id || !business_id) return NextResponse.json({ error: 'id and business_id required' }, { status: 400 });

  const { data: biz } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', business_id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (status) updates.status = status;
  if (aria_analysis) updates.aria_analysis = aria_analysis;
  if (aria_confidence) updates.aria_confidence = aria_confidence;
  if (estimated_monthly_revenue_cents !== undefined) updates.estimated_monthly_revenue_cents = estimated_monthly_revenue_cents;

  const { data: updated, error } = await supabase
    .from('missed_demand')
    .update(updates)
    .eq('id', id)
    .eq('business_id', business_id)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: updated });
}

export const GET = withErrorCapture('pos/missed-demand', _GET)
export const POST = withErrorCapture('pos/missed-demand', _POST)
export const PATCH = withErrorCapture('pos/missed-demand', _PATCH)
