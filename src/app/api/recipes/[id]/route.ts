import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const body = await req.json();
  const { ingredients, ...fields } = body;

  const { data: recipe, error } = await supabase
    .from('recipes')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (Array.isArray(ingredients)) {
    await supabase.from('recipe_ingredients').delete().eq('recipe_id', params.id);
    if (ingredients.length > 0) {
      const rows = ingredients.map((ing: any) => ({
        recipe_id: params.id,
        business_id: recipe.business_id,
        ingredient_name: ing.ingredient_name,
        quantity: ing.quantity,
        unit: ing.unit ?? 'g',
        cost_cents: ing.cost_cents ?? null,
        notes: ing.notes ?? null,
        product_id: ing.product_id ?? null,
      }));
      await supabase.from('recipe_ingredients').insert(rows);
    }
  }

  return NextResponse.json({ recipe });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { error } = await supabase.from('recipes').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
