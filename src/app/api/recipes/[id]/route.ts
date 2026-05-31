import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

export const dynamic = 'force-dynamic';

async function _PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  // Ownership check: fetch recipe → verify user owns the business
  const { data: existing } = await supabase.from('recipes').select('id, business_id').eq('id', params.id).maybeSingle();
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { data: biz } = await supabase.from('businesses').select('id').eq('id', existing.business_id).eq('user_id', user.id).maybeSingle();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

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
        cost_per_unit: ing.cost_per_unit ?? null,
        supplier_id: ing.supplier_id ?? null,
        allergens: ing.allergens ?? [],
        notes: ing.notes ?? null,
        product_id: ing.product_id ?? null,
      }));
      await supabase.from('recipe_ingredients').insert(rows);
    }
  }

  return NextResponse.json({ recipe });
}

async function _DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  // Ownership check
  const { data: existing } = await supabase.from('recipes').select('id, business_id').eq('id', params.id).maybeSingle();
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { data: biz } = await supabase.from('businesses').select('id').eq('id', existing.business_id).eq('user_id', user.id).maybeSingle();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { error } = await supabase.from('recipes').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export const PATCH = withErrorCapture('recipes/[id]', _PATCH)
export const DELETE = withErrorCapture('recipes/[id]', _DELETE)
