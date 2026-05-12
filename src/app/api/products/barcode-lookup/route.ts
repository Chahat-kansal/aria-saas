export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { lookupBarcode } from '@/lib/external-apis';
import { withErrorCapture } from '@/lib/api/with-error-capture'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const barcode = searchParams.get('barcode')?.trim();
  if (!barcode) return NextResponse.json({ error: 'barcode required' }, { status: 400 });

  // GS1_AU_API_KEY: add env var when available for official GS1 Australia registry lookup
  // Cascade: 1) local global_products → 2) Open Food Facts (free, no key) → not_found

  // 1. Check local global_products table first
  const { data: existing } = await supabase
    .from('global_products')
    .select('id, barcode, name, brand, category, size, unit, suggested_price_cents, image_url, is_age_restricted')
    .eq('barcode', barcode)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ found: true, source: 'global_products', product: existing });
  }

  // 2. Try Open Food Facts
  const offResult = await lookupBarcode(barcode);
  if (!offResult.found) {
    return NextResponse.json({ found: false, source: 'not_found' });
  }

  // 3. Haiku cleanup to normalise the result
  let cleanName = offResult.name ?? '';
  let cleanCategory = offResult.category ?? '';
  if (cleanName && process.env.ANTHROPIC_API_KEY) {
    try {
      const msg = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 100,
        messages: [{
          role: 'user',
          content: `Clean up this product name and category for an Australian retail POS system.
Product name: "${offResult.name}"
Brand: "${offResult.brand}"
Raw category: "${offResult.category}"
Return JSON only: {"name":"cleaned full product name","category":"single category word e.g. Beer & Cider, Wine, Spirits, Soft Drinks, Snacks, Confectionery, Dairy, Bakery, Frozen"}`,
        }],
      });
      const raw = msg.content[0].type === 'text' ? msg.content[0].text : '';
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        cleanName = parsed.name || cleanName;
        cleanCategory = parsed.category || cleanCategory;
      }
    } catch { /* use raw values */ }
  }

  // 4. Upsert into global_products for future lookups
  const productData = {
    barcode,
    name: cleanName || offResult.name || 'Unknown Product',
    brand: offResult.brand ?? null,
    category: cleanCategory || null,
    size: offResult.size ?? null,
    image_url: offResult.image_url ?? null,
    ingredients_text: offResult.ingredients ?? null,
    is_age_restricted: offResult.is_age_restricted ?? false,
    source: 'open_food_facts',
    last_verified_at: new Date().toISOString(),
  };

  const { data: upserted } = await supabase
    .from('global_products')
    .upsert(productData, { onConflict: 'barcode' })
    .select('id, barcode, name, brand, category, size, unit, suggested_price_cents, image_url, is_age_restricted')
    .maybeSingle();

  return NextResponse.json({
    found: true,
    source: 'open_food_facts',
    product: upserted ?? productData,
  });
}

export const GET = withErrorCapture('products/barcode-lookup', _GET)
