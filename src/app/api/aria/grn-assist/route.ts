export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { trackAICall } from '@/lib/aria/ai-telemetry'
import { getBusinessContext, hasEnoughData } from '@/lib/aria/get-business-context'
import { getSystemPrompt } from '@/lib/aria/get-system-prompt'
import { writeAriaOutcome } from '@/lib/aria/write-outcome'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function getBid(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  userId: string
): Promise<string | null> {
  const { data: active } = await supabase
    .from('user_active_business')
    .select('business_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase
    .from('businesses')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

interface GrnItem {
  item_name: string;
  quantity: number;
}

interface GrnAssistResponse {
  observations: string[];
  warnings: string[];
  suggestions: string[];
}

async function _POST(req: Request): Promise<Response> {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    business_id?: string;
    supplier_name?: string;
    items?: GrnItem[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({
      observations: [],
      warnings: [],
      suggestions: [],
    } satisfies GrnAssistResponse);
  }

  const business_id = body.business_id ?? (await getBid(supabase, user.id));
  if (!business_id) {
    return NextResponse.json({
      observations: [],
      warnings: [],
      suggestions: [],
    } satisfies GrnAssistResponse);
  }

  // Ownership check
  const { data: biz } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', business_id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!biz) {
    return NextResponse.json({
      observations: [],
      warnings: [],
      suggestions: [],
    } satisfies GrnAssistResponse);
  }

  const supplierName = body.supplier_name ?? '';
  const items: GrnItem[] = Array.isArray(body.items) ? body.items : [];

  if (items.length === 0) {
    return NextResponse.json({
      observations: [],
      warnings: [],
      suggestions: [],
    } satisfies GrnAssistResponse);
  }

  try {
    const now = new Date();
    const sixtyDaysFromNow = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    // Fetch matching products for all items in parallel
    const productPromises = items.map((item) =>
      supabase
        .from('pos_products')
        .select('id, name, stock_quantity, low_stock_threshold, cost_price')
        .eq('business_id', business_id)
        .ilike('name', `%${item.item_name}%`)
        .limit(1)
        .maybeSingle()
    );

    const [productResults, grnRes, expiringLotsRes] = await Promise.all([
      Promise.all(productPromises),
      supabase
        .from('warehouse_grns')
        .select('id, created_at, items')
        .eq('business_id', business_id)
        .ilike('supplier_name', `%${supplierName}%`)
        .order('created_at', { ascending: false })
        .limit(3),
      supabase
        .from('warehouse_lots')
        .select('id, product_id, product_name, quantity, expiry_date')
        .eq('business_id', business_id)
        .lte('expiry_date', sixtyDaysFromNow)
        .gte('expiry_date', now.toISOString().split('T')[0]),
    ]);

    const products = productResults.map((r) => r.data).filter(Boolean);
    const recentGrns = grnRes.data ?? [];
    const expiringLots = expiringLotsRes.data ?? [];

    // Build context strings
    const productContext = products
      .map((p) => {
        if (!p) return null;
        const prod = p as {
          name: string;
          stock_quantity: number | null;
          low_stock_threshold: number | null;
          cost_price: number | null;
        };
        return `${prod.name}: stock=${prod.stock_quantity ?? 0}, threshold=${prod.low_stock_threshold ?? 0}, cost=A$${prod.cost_price ?? 0}`;
      })
      .filter(Boolean)
      .join('; ');

    const grnContext =
      recentGrns.length > 0
        ? `Last ${recentGrns.length} deliveries from ${supplierName}: ${recentGrns
            .map(
              (g: { created_at: string; items: unknown }) =>
                `${new Date(g.created_at).toLocaleDateString('en-AU')} - ${JSON.stringify(g.items).slice(0, 100)}`
            )
            .join(' | ')}`
        : 'No recent delivery history for this supplier.';

    const expiringContext =
      expiringLots.length > 0
        ? `Expiring lots: ${expiringLots
            .map(
              (l: {
                product_name: string | null;
                quantity: number | null;
                expiry_date: string | null;
              }) =>
                `${l.product_name ?? 'Unknown'} qty=${l.quantity ?? 0} expires=${l.expiry_date ?? 'unknown'}`
            )
            .join(', ')}`
        : 'No lots expiring within 60 days.';

    const itemsContext = items
      .map((i) => `${i.item_name} x${i.quantity}`)
      .join(', ');

    const _bizCtx = await getBusinessContext(business_id)
  const _industry = (JSON.parse(_bizCtx))?.business?.industry ?? 'retail'
  const systemPrompt = getSystemPrompt(_industry as string, _bizCtx)
  const msg = 
await trackAICall({ route: 'aria/grn-assist', model: 'claude-sonnet-4-5-20250929', businessId: business_id, purpose: 'grn-assist' }, () => anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 200,
      system: [{ type: 'text' as const, text: systemPrompt, cache_control: { type: 'ephemeral' as const } }],
      messages: [
        {
          role: 'user',
          content: `Supplier: ${supplierName}. Items being received: ${itemsContext}. Current stock levels: ${productContext || 'no matching products found'}. Recent delivery history: ${grnContext}. Expiring lots: ${expiringContext}.`,
        },
      ],
    }));

    const rawText =
      msg.content[0].type === 'text' ? msg.content[0].text.trim() : '';

    // Attempt to parse JSON from Claude response
    let parsed: GrnAssistResponse = { observations: [], warnings: [], suggestions: [] };
    try {
      // Extract JSON block if wrapped in markdown
      const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/) ??
        rawText.match(/(\{[\s\S]*\})/);
      const jsonStr = jsonMatch ? jsonMatch[1] : rawText;
      const { parseLLMJsonOr } = await import('@/lib/ai-json');
      const candidate = parseLLMJsonOr<Partial<GrnAssistResponse>>(jsonStr, {}, 'aria/grn-assist');
      parsed = {
        observations: Array.isArray(candidate.observations)
          ? (candidate.observations as string[])
          : [],
        warnings: Array.isArray(candidate.warnings)
          ? (candidate.warnings as string[])
          : [],
        suggestions: Array.isArray(candidate.suggestions)
          ? (candidate.suggestions as string[])
          : [],
      };
    } catch {
      // If JSON parse fails, treat the whole response as a single observation
      console.error('[aria/grn-assist] Failed to parse Claude JSON response, using raw text');
      parsed = {
        observations: rawText ? [rawText] : [],
        warnings: [],
        suggestions: [],
      };
    }

    return NextResponse.json(parsed satisfies GrnAssistResponse);
  } catch (err) {
    console.error('[aria/grn-assist] error', err);
    return NextResponse.json({
      observations: [],
      warnings: [],
      suggestions: [],
    } satisfies GrnAssistResponse);
  }
}

export const POST = withErrorCapture('aria/grn-assist', _POST)
