export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { withErrorCapture } from '@/lib/api/with-error-capture';

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const business_id = url.searchParams.get('business_id');
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).maybeSingle();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [wasteRes, recipesRes, salesRes] = await Promise.all([
    supabaseAdmin
      .from('recipe_waste_log')
      .select('recipe_id, waste_cost, wasted_quantity, unit')
      .eq('business_id', business_id)
      .gte('logged_at', sevenDaysAgo),
    supabaseAdmin
      .from('recipes')
      .select('id, name, total_cost, menu_price, linked_product_id')
      .eq('business_id', business_id)
      .eq('is_active', true)
      .is('deleted_at', null),
    supabaseAdmin
      .from('pos_sales')
      .select('id')
      .eq('business_id', business_id)
      .gte('created_at', sevenDaysAgo)
      .neq('status', 'voided'),
  ]);

  const wasteLogs = wasteRes.data ?? [];
  const recipes = recipesRes.data ?? [];
  const validSaleIds = new Set((salesRes.data ?? []).map((s: { id: string }) => s.id));

  const waste_cost_total = wasteLogs.reduce((sum, w) => sum + (Number(w.waste_cost) || 0), 0);

  const wasteByRecipe: Record<string, number> = {};
  for (const w of wasteLogs) {
    if (w.recipe_id) wasteByRecipe[w.recipe_id] = (wasteByRecipe[w.recipe_id] ?? 0) + (Number(w.waste_cost) || 0);
  }

  const top_waste = recipes
    .filter(r => (wasteByRecipe[r.id] ?? 0) > 0)
    .map(r => ({ id: r.id, name: r.name, waste_cost: wasteByRecipe[r.id] }))
    .sort((a, b) => b.waste_cost - a.waste_cost)
    .slice(0, 3);

  const linkedProductIds = [...new Set(recipes.map(r => r.linked_product_id).filter(Boolean) as string[])];
  let revenue_total = 0;
  const revenueByProduct: Record<string, number> = {};

  if (linkedProductIds.length > 0 && validSaleIds.size > 0) {
    const { data: saleItems } = await supabaseAdmin
      .from('pos_sale_items')
      .select('sale_id, product_id, line_total')
      .in('sale_id', [...validSaleIds])
      .in('product_id', linkedProductIds);

    for (const si of saleItems ?? []) {
      const lt = Number(si.line_total) || 0;
      revenueByProduct[si.product_id] = (revenueByProduct[si.product_id] ?? 0) + lt;
      revenue_total += lt;
    }
  }

  const effective_margins = recipes
    .filter(r => r.linked_product_id && (revenueByProduct[r.linked_product_id] ?? 0) > 0)
    .map(r => {
      const revenue = revenueByProduct[r.linked_product_id!] ?? 0;
      const ingredient_cost = Number(r.total_cost ?? 0);
      const waste = wasteByRecipe[r.id] ?? 0;
      const eff_margin = revenue > 0 ? ((revenue - ingredient_cost - waste) / revenue) * 100 : null;
      const base_margin = r.menu_price && ingredient_cost > 0
        ? ((Number(r.menu_price) - ingredient_cost) / Number(r.menu_price)) * 100
        : null;
      return {
        id: r.id,
        name: r.name,
        revenue,
        ingredient_cost,
        waste_cost: waste,
        eff_margin_pct: eff_margin != null ? Math.round(eff_margin) : null,
        base_margin_pct: base_margin != null ? Math.round(base_margin) : null,
      };
    })
    .sort((a, b) => (a.eff_margin_pct ?? 999) - (b.eff_margin_pct ?? 999));

  return NextResponse.json({
    period_days: 7,
    waste_cost_total,
    revenue_total,
    top_waste,
    effective_margins,
  });
}

export const GET = withErrorCapture('recipes/waste-impact', _GET);
