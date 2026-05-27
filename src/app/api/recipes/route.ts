import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

export const dynamic = 'force-dynamic';

async function _GET(req: NextRequest) {
  const business_id = req.nextUrl.searchParams.get('business_id');
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { data: recipes, error } = await supabase
    .from('recipes')
    .select('*, recipe_ingredients(*), recipe_training_assets(*)')
    .eq('business_id', business_id)
    .order('name');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ recipes: recipes ?? [] });
}

async function _POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const body = await req.json();
  const { business_id, name, description, category, serves, prep_time_minutes, sell_price_cents, menu_price, cost_per_serve, margin_percent, allergens, linked_product_id, notes, ingredients } = body;
  if (!business_id || !name) return NextResponse.json({ error: 'business_id and name required' }, { status: 400 });

  const { data: recipe, error } = await supabase
    .from('recipes')
    .insert({ business_id, name, description, category, serves: serves ?? 1, prep_time_minutes, sell_price_cents, menu_price: menu_price ?? null, cost_per_serve: cost_per_serve ?? null, margin_percent: margin_percent ?? null, allergens: allergens ?? [], linked_product_id: linked_product_id ?? null, notes })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (Array.isArray(ingredients) && ingredients.length > 0) {
    const rows = ingredients.map((ing: any) => ({
      recipe_id: recipe.id,
      business_id,
      ingredient_name: ing.ingredient_name,
      quantity: ing.quantity,
      unit: ing.unit ?? 'g',
      cost_cents: ing.cost_cents ?? null,
      cost_per_unit: ing.cost_per_unit ?? null,
      supplier_id: ing.supplier_id ?? null,
      allergens: ing.allergens ?? [],
      notes: ing.notes ?? null,
      product_id: ing.product_id ?? null,
    }));
    await supabase.from('recipe_ingredients').insert(rows);
  }

  return NextResponse.json({ recipe });
}

export const GET = withErrorCapture('recipes', _GET)
export const POST = withErrorCapture('recipes', _POST)
