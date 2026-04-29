import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
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

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const body = await req.json();
  const { business_id, name, description, category, serves, prep_time_minutes, sell_price_cents, notes, ingredients } = body;
  if (!business_id || !name) return NextResponse.json({ error: 'business_id and name required' }, { status: 400 });

  const { data: recipe, error } = await supabase
    .from('recipes')
    .insert({ business_id, name, description, category, serves: serves ?? 1, prep_time_minutes, sell_price_cents, notes })
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
      notes: ing.notes ?? null,
      product_id: ing.product_id ?? null,
    }));
    await supabase.from('recipe_ingredients').insert(rows);
  }

  return NextResponse.json({ recipe });
}
