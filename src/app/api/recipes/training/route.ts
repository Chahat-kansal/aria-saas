import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

export const dynamic = 'force-dynamic';

async function _GET(req: NextRequest) {
  const business_id = req.nextUrl.searchParams.get('business_id');
  const staff_id = req.nextUrl.searchParams.get('staff_id');
  const recipe_id = req.nextUrl.searchParams.get('recipe_id');
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).maybeSingle();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Use explicit FK hint syntax to disambiguate the two FKs to staff_members:
  // staff_member:staff_member_id(name) — joins via staff_member_id FK
  let query = supabase
    .from('staff_recipe_training')
    .select('*, recipes(name, category), staff_member:staff_member_id(name)')
    .eq('business_id', business_id);

  if (staff_id) query = query.eq('staff_member_id', staff_id);
  if (recipe_id) query = query.eq('recipe_id', recipe_id);

  const { data, error } = await query.order('updated_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ training: data ?? [] });
}

async function _POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { business_id, staff_member_id, recipe_id, status, notes, signed_off_by } = await req.json();
  if (!business_id || !recipe_id) return NextResponse.json({ error: 'business_id and recipe_id required' }, { status: 400 });

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).maybeSingle();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    business_id,
    staff_member_id: staff_member_id ?? null,
    recipe_id,
    status: status ?? 'not_started',
    notes: notes ?? null,
    signed_off_by: signed_off_by ?? null,
    updated_at: now,
  };
  if (status === 'completed') payload.completed_at = now;

  let result;
  if (staff_member_id) {
    result = await supabase
      .from('staff_recipe_training')
      .upsert(payload, { onConflict: 'staff_member_id,recipe_id' })
      .select()
      .single();
  } else {
    const { data: existing } = await supabase
      .from('staff_recipe_training')
      .select('id')
      .eq('business_id', business_id)
      .eq('recipe_id', recipe_id)
      .is('staff_member_id', null)
      .maybeSingle();

    if (existing) {
      result = await supabase
        .from('staff_recipe_training')
        .update(payload)
        .eq('id', existing.id)
        .select()
        .single();
    } else {
      result = await supabase
        .from('staff_recipe_training')
        .insert(payload)
        .select()
        .single();
    }
  }

  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  return NextResponse.json({ training: result.data });
}

export const GET = withErrorCapture('recipes/training', _GET)
export const POST = withErrorCapture('recipes/training', _POST)
