export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { withErrorCapture } from '@/lib/api/with-error-capture';

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const recipe_id = new URL(req.url).searchParams.get('recipe_id');
  if (!recipe_id) return NextResponse.json({ error: 'recipe_id required' }, { status: 400 });
  const { data } = await supabase.from('recipe_ingredients').select('*').eq('recipe_id', recipe_id);
  return NextResponse.json({ ingredients: data ?? [] });
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const { recipe_id, business_id, ingredient_name, quantity, unit, cost_per_unit, cost_cents, supplier_id, allergens } = body;
  if (!recipe_id || !ingredient_name) return NextResponse.json({ error: 'recipe_id and ingredient_name required' }, { status: 400 });
  const { data, error } = await supabase.from('recipe_ingredients').insert({
    recipe_id, business_id, ingredient_name,
    quantity: quantity ?? 1, unit: unit ?? 'g',
    cost_per_unit: cost_per_unit ?? null,
    cost_cents: cost_cents ?? null,
    supplier_id: supplier_id ?? null,
    allergens: allergens ?? [],
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ingredient: data });
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const body = await req.json();
  const patch: Record<string, unknown> = {};
  for (const k of ['ingredient_name','quantity','unit','cost_per_unit','cost_cents','supplier_id','allergens']) {
    if (body[k] !== undefined) patch[k] = body[k];
  }
  const { error } = await supabase.from('recipe_ingredients').update(patch).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

async function _DELETE(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const { error } = await supabase.from('recipe_ingredients').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export const GET = withErrorCapture('recipes/ingredients', _GET);
export const POST = withErrorCapture('recipes/ingredients', _POST);
export const PATCH = withErrorCapture('recipes/ingredients', _PATCH);
export const DELETE = withErrorCapture('recipes/ingredients', _DELETE);
