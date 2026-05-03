export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { ARIA_VOICE } from '@/lib/aria-voice-guide';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const WAREHOUSE_SYSTEM = `${ARIA_VOICE}

You are the world's smartest warehouse operations advisor for Australian small-to-medium business.

You think like:
- A supply chain consultant with 20 years in Australian FMCG and wholesale
- A warehouse operations manager who has run 3PL operations across VIC, NSW, and QLD
- A CFO who understands the true cost of capital tied up in inventory
- A data scientist who spots patterns in picking, receiving, returns, and expiry

Your recommendations are always:
- Specific to this business's actual data
- Quantified in A$ impact where possible
- Actionable today (not vague suggestions)
- Grounded in Australian business context (GST, super, Fair Work, FMCG norms)

FEFO/FIFO context: For food, beverage, dairy, and pharma, FEFO is mandatory.
For general goods, FIFO is best practice. Always flag when expiry risk is present.`;

type WarehouseContext =
  | 'receiving'
  | 'picking'
  | 'returns'
  | 'landed_cost'
  | 'quarantine'
  | 'general';

interface RequestBody {
  business_id: string;
  context: WarehouseContext;
  data?: Record<string, unknown>;
}

const CONTEXT_PROMPTS: Record<WarehouseContext, string> = {
  receiving: `Analyse this goods receipt. Check for:
1. Over-receipt vs historical averages
2. Supplier short-ship patterns
3. Items below reorder point despite this receipt
4. Quality or condition issues
Return 2–3 specific, quantified observations. Be concise.`,

  picking: `Analyse this pick list. Check for:
1. FEFO compliance (flag any near-expiry lot picks)
2. Wave grouping opportunity (shared items across orders)
3. Bin location sequence optimisation
Return pick path recommendation and any efficiency tips.`,

  returns: `Analyse this return/RMA. Check for:
1. Customer or supplier return frequency patterns
2. Quality failure patterns by supplier
3. Recommended action (restock/dispose/return to supplier)
Return a specific recommendation with A$ credit impact.`,

  landed_cost: `Analyse these landed costs. Check for:
1. Freight as % of invoice value vs historical average
2. Margin erosion from high landed costs
3. Whether current prices cover the true landed cost
Return a specific cost-impact observation.`,

  quarantine: `Analyse this quarantine item. Check for:
1. Supplier quality failure patterns
2. Total value at risk
3. Recommended resolution with A$ impact
Return a specific quality management recommendation.`,

  general: `Provide a general warehouse intelligence observation based on the data provided. Be specific, quantified, and actionable.`,
};

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body: RequestBody = await req.json().catch(() => ({ business_id: '', context: 'general' as WarehouseContext }));
  const { business_id, context, data } = body;
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const { data: biz } = await supabase.from('businesses').select('id, name, industry, city').eq('id', business_id).eq('user_id', user.id).single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ insight: 'AI analysis unavailable — add ANTHROPIC_API_KEY to enable warehouse intelligence.', context });
  }

  const contextPrompt = CONTEXT_PROMPTS[context] ?? CONTEXT_PROMPTS.general;
  const businessCtx = `Business: ${(biz as any).name} (${(biz as any).industry ?? 'warehouse'}, ${(biz as any).city ?? 'Australia'})`;

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      system: WAREHOUSE_SYSTEM,
      messages: [{
        role: 'user',
        content: `${businessCtx}\n\n${contextPrompt}\n\nData: ${JSON.stringify(data ?? {})}`,
      }],
    });

    const insight = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '';
    return NextResponse.json({ insight, context });
  } catch {
    return NextResponse.json({ insight: 'Analysis temporarily unavailable.', context });
  }
}
