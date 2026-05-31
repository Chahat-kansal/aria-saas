export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { withErrorCapture } from '@/lib/api/with-error-capture';

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  const business_id = url.searchParams.get('business_id');
  const recipe_id = url.searchParams.get('recipe_id');
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });
  // Ownership check
  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).maybeSingle();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  let q = supabase.from('recipe_waste_log').select('*').eq('business_id', business_id).order('logged_at', { ascending: false }).limit(200);
  if (recipe_id) q = q.eq('recipe_id', recipe_id);
  const { data } = await q;
  return NextResponse.json({ waste: data ?? [] });
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const { business_id, recipe_id, wasted_quantity, unit, reason, waste_cost } = body;
  if (!business_id || !recipe_id) return NextResponse.json({ error: 'business_id and recipe_id required' }, { status: 400 });
  // Ownership check
  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).maybeSingle();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { data, error } = await supabase.from('recipe_waste_log').insert({
    business_id, recipe_id,
    wasted_quantity: wasted_quantity ?? 0,
    unit: unit ?? 'each',
    reason: reason ?? null,
    waste_cost: waste_cost ?? null,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entry: data });
}

async function _DELETE(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  // Ownership: fetch log entry → verify business
  const { data: entry } = await supabase.from('recipe_waste_log').select('id, business_id').eq('id', id).maybeSingle();
  if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { data: biz } = await supabase.from('businesses').select('id').eq('id', entry.business_id).eq('user_id', user.id).maybeSingle();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { error } = await supabase.from('recipe_waste_log').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export const GET = withErrorCapture('recipes/waste', _GET);
export const POST = withErrorCapture('recipes/waste', _POST);
export const DELETE = withErrorCapture('recipes/waste', _DELETE);
