import { supabaseAdmin } from '@/lib/supabase';

export type WebsiteAssistantContext = {
  business: {
    name: string;
    industry: string | null;
    city: string | null;
    phone: string | null;
    email: string | null;
  } | null;
  products: Array<{ name: string; category: string | null; price_cents: number | null; current_stock: number | null; is_active: boolean }>;
  recipes: Array<{ name: string; description: string | null; category: string | null; sell_price_cents: number | null; ingredients_summary: string }>;
  top_sellers: Array<{ name: string; sales_count: number }>;
  opening_hours: Record<string, string>;
  faqs: Array<{ q: string; a: string }>;
  services: string;
};

export async function buildWebsiteAssistantContext(
  businessId: string,
  widgetConfig: Record<string, any>
): Promise<WebsiteAssistantContext> {
  if (!supabaseAdmin) {
    return emptyContext(widgetConfig);
  }

  const since30 = new Date(Date.now() - 30 * 86400000).toISOString();

  const [bizRes, productsRes, recipesRes, saleItemsRes] = await Promise.all([
    supabaseAdmin.from('businesses').select('name, industry, city, phone, email').eq('id', businessId).maybeSingle(),
    supabaseAdmin.from('pos_products').select('name, category, price_cents, current_stock, is_active').eq('business_id', businessId).eq('is_active', true).limit(200),
    supabaseAdmin.from('recipes').select('name, description, category, sell_price_cents, recipe_ingredients(ingredient_name, quantity, unit)').eq('business_id', businessId).eq('is_active', true).limit(50),
    supabaseAdmin.from('pos_sale_items').select('product_name, quantity').eq('business_id', businessId).gte('created_at', since30).limit(1000), // TODO: needs pos_sales join, see issue
  ]);

  const productRows = (productsRes.data ?? []) as Array<{ name: string; category: string | null; price_cents: number | null; current_stock: number | null; is_active: boolean }>;
  const products = productRows.map(p => ({
    name: p.name,
    category: p.category ?? null,
    price_cents: p.price_cents ?? null,
    current_stock: p.current_stock ?? null,
    is_active: p.is_active ?? true,
  }));

  const recipes = (recipesRes.data ?? []).map((r: any) => {
    const ings = Array.isArray(r.recipe_ingredients)
      ? r.recipe_ingredients.map((i: any) => `${i.ingredient_name} ${i.quantity}${i.unit}`).join(', ')
      : '';
    return {
      name: r.name,
      description: r.description ?? null,
      category: r.category ?? null,
      sell_price_cents: r.sell_price_cents ?? null,
      ingredients_summary: ings,
    };
  });

  // Count top sellers
  const salesCount: Record<string, number> = {};
  for (const item of saleItemsRes.data ?? []) {
    const name = item.product_name ?? 'Unknown';
    salesCount[name] = (salesCount[name] ?? 0) + Number(item.quantity ?? 1);
  }
  const topSellers = Object.entries(salesCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, sales_count]) => ({ name, sales_count }));

  return {
    business: bizRes.data ?? null,
    products,
    recipes,
    top_sellers: topSellers,
    opening_hours: (widgetConfig.opening_hours as Record<string, string>) ?? {},
    faqs: Array.isArray(widgetConfig.faqs) ? widgetConfig.faqs : [],
    services: widgetConfig.services ?? '',
  };
}

function emptyContext(widgetConfig: Record<string, any>): WebsiteAssistantContext {
  return {
    business: null,
    products: [],
    recipes: [],
    top_sellers: [],
    opening_hours: (widgetConfig.opening_hours as Record<string, string>) ?? {},
    faqs: Array.isArray(widgetConfig.faqs) ? widgetConfig.faqs : [],
    services: widgetConfig.services ?? '',
  };
}

export function buildProductContext(intent: string, message: string, ctx: WebsiteAssistantContext): string {
  const m = message.toLowerCase();

  if (intent === 'MENU_QUERY' || intent === 'PRODUCT_SEARCH') {
    const lines: string[] = [];
    if (ctx.recipes.length > 0) {
      lines.push('Menu items:');
      ctx.recipes.forEach(r => {
        const price = r.sell_price_cents != null ? ` — A$${(r.sell_price_cents / 100).toFixed(2)}` : '';
        lines.push(`• ${r.name}${price}${r.description ? ` (${r.description})` : ''}`);
      });
    }
    if (ctx.products.length > 0) {
      const inStock = ctx.products.filter(p => (p.current_stock ?? 1) > 0);
      const cats: Record<string, string[]> = {};
      inStock.forEach(p => { const c = p.category ?? 'General'; if (!cats[c]) cats[c] = []; cats[c].push(p.name); });
      lines.push(`\nProducts (${inStock.length} in stock):`);
      Object.entries(cats).slice(0, 6).forEach(([cat, names]) => lines.push(`${cat}: ${names.slice(0, 4).join(', ')}`));
    }
    return lines.join('\n') || 'Product catalogue not available.';
  }

  if (intent === 'STOCK_QUERY') {
    const words = m.split(/\s+/).filter(w => w.length > 2);
    const matchedProducts = ctx.products.filter(p => words.some(w => p.name.toLowerCase().includes(w)));
    const matchedRecipes = ctx.recipes.filter(r => words.some(w => r.name.toLowerCase().includes(w)));
    const lines: string[] = [];
    matchedRecipes.forEach(r => {
      const price = r.sell_price_cents != null ? ` — A$${(r.sell_price_cents / 100).toFixed(2)}` : '';
      lines.push(`• ${r.name}${price}: Available on menu`);
    });
    matchedProducts.forEach(p => {
      const stock = (p.current_stock ?? 0) > 0 ? `${p.current_stock} in stock` : 'OUT OF STOCK';
      const price = p.price_cents != null ? ` — A$${(p.price_cents / 100).toFixed(2)}` : '';
      lines.push(`• ${p.name}${price}: ${stock}`);
    });
    return lines.length > 0 ? lines.join('\n') : 'No matching items found in our catalogue.';
  }

  if (intent === 'RECOMMENDATION') {
    const lines: string[] = [];
    if (ctx.top_sellers.length > 0) {
      lines.push('Popular items this month:');
      ctx.top_sellers.slice(0, 5).forEach(s => lines.push(`• ${s.name}`));
    }
    if (ctx.recipes.length > 0) {
      lines.push('\nMenu highlights:');
      ctx.recipes.slice(0, 4).forEach(r => {
        const price = r.sell_price_cents != null ? ` — A$${(r.sell_price_cents / 100).toFixed(2)}` : '';
        lines.push(`• ${r.name}${price}`);
      });
    }
    return lines.join('\n') || 'Ask our staff for recommendations.';
  }

  return '';
}
