import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { runAriaModel } from '@/lib/aria/model-router';
import { withErrorCapture } from '@/lib/api/with-error-capture'

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

async function _POST(req: NextRequest) {
  try {
    const { business_id } = await req.json();
    if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

    const supabase = createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

    const [bizRes, productsRes, salesRes] = await Promise.all([
      supabase.from('businesses').select('name, industry, suburb, state').eq('id', business_id).maybeSingle(),
      supabase.from('pos_products').select('name, category, price_cents, current_stock').eq('business_id', business_id).limit(100),
      supabase.from('pos_sale_items').select('product_name, quantity').eq('business_id', business_id)
        .gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString()).limit(500),
    ]);

    const business = bizRes.data;
    const products = productsRes.data ?? [];
    const salesItems = salesRes.data ?? [];

    // Count product sales frequency
    const salesCount: Record<string, number> = {};
    for (const item of salesItems) {
      const name = item.product_name ?? 'Unknown';
      salesCount[name] = (salesCount[name] ?? 0) + Number(item.quantity ?? 1);
    }
    const topSellers = Object.entries(salesCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([name, qty]) => ({ name, qty }));

    const result = await runAriaModel<{ suggestions: Array<{ name: string; description: string; category: string; ingredients: Array<{ ingredient_name: string; quantity: number; unit: string }>; estimated_cost_dollars: number; suggested_sell_price_dollars: number; reason: string }> }>({
      task: 'chat',
      systemPrompt: `You are Aria, an AI co-owner for an Australian ${business?.industry ?? 'retail'} business called ${business?.name ?? 'this business'}.
Suggest practical, profitable recipes or menu items based on the products already in stock.
Consider: Australian café culture, seasonal trends, and what sells well.
Never suggest ingredients not available. Keep recipes realistic for a small business owner.`,
      userPrompt: `Products in stock: ${JSON.stringify(products.slice(0, 50).map(p => ({ name: p.name, category: p.category })))}
Top sellers last 30 days: ${JSON.stringify(topSellers)}

Suggest 4-6 new recipe or menu items that:
1. Use products already in stock
2. Have good margin potential
3. Suit the business type (${business?.industry ?? 'retail/café'})

Return JSON: {
  "suggestions": [
    {
      "name": "Recipe name",
      "description": "Brief description",
      "category": "coffee|food|drink|cocktail|other",
      "ingredients": [{ "ingredient_name": "...", "quantity": 1.5, "unit": "g|ml|each|tsp|tbsp|cup" }],
      "estimated_cost_dollars": 2.50,
      "suggested_sell_price_dollars": 7.50,
      "reason": "Why this suits this business"
    }
  ]
}`,
      maxTokens: 1500,
      temperature: 0.3,
    });

    if (!result.ok || !result.data) {
      return NextResponse.json({ suggestions: [] });
    }

    return NextResponse.json({ suggestions: result.data.suggestions ?? [] });
  } catch (error) {
    console.error('[api/aria/recipe-suggestions]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export const POST = withErrorCapture('aria/recipe-suggestions', _POST)
