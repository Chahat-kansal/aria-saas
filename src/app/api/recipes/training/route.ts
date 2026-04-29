import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const business_id = req.nextUrl.searchParams.get('business_id');
  const staff_id = req.nextUrl.searchParams.get('staff_id');
  const recipe_id = req.nextUrl.searchParams.get('recipe_id');
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  let query = supabase
    .from('staff_recipe_training')
    .select('*, recipes(name, category), staff_members(name)')
    .eq('business_id', business_id);

  if (staff_id) query = query.eq('staff_member_id', staff_id);
  if (recipe_id) query = query.eq('recipe_id', recipe_id);

  const { data, error } = await query.order('updated_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ training: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { business_id, staff_member_id, recipe_id, status, notes, signed_off_by } = await req.json();
  if (!business_id || !recipe_id) return NextResponse.json({ error: 'business_id and recipe_id required' }, { status: 400 });

  const payload: Record<string, any> = {
    business_id,
    staff_member_id: staff_member_id ?? null,
    recipe_id,
    status: status ?? 'not_started',
    notes: notes ?? null,
    signed_off_by: signed_off_by ?? null,
    updated_at: new Date().toISOString(),
  };
  if (status === 'completed') payload.completed_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('staff_recipe_training')
    .upsert(payload, { onConflict: 'staff_member_id,recipe_id' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ training: data });
}
