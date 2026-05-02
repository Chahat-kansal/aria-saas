import Anthropic from '@anthropic-ai/sdk';
import { ARIA_VOICE } from '@/lib/aria-voice-guide';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getBusinessSales, getBusinessItems } from '@/lib/business-data';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { business_id } = await req.json();
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const { data: biz } = await supabase.from('businesses').select('id, data_source').eq('id', business_id).eq('user_id', user.id).single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const dataSource = (biz.data_source ?? 'aria_pos') as 'square' | 'aria_pos';
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [items, sales, locations, itemLocs] = await Promise.all([
    getBusinessItems(business_id, dataSource),
    getBusinessSales(business_id, thirtyDaysAgo, dataSource),
    supabase.from('warehouse_locations').select('id, label, zone, bay, shelf').eq('business_id', business_id),
    supabase.from('warehouse_item_locations').select('item_id, location_id, warehouse_locations(label, zone, bay)').eq('business_id', business_id),
  ]);

  // Calculate velocity per item
  const unitsSold: Record<string, number> = {};
  for (const sale of sales) {
    for (const li of sale.lineItems) {
      unitsSold[li.itemId] = (unitsSold[li.itemId] ?? 0) + li.quantity;
    }
  }

  const rankedItems = items
    .map(i => ({ ...i, velocity: unitsSold[i.id] ?? unitsSold[i.externalId] ?? 0 }))
    .sort((a, b) => b.velocity - a.velocity)
    .slice(0, 20);

  const currentLocs = (itemLocs.data ?? []).reduce((acc: Record<string, any>, il: any) => {
    acc[il.item_id] = il.warehouse_locations;
    return acc;
  }, {});

  if (!rankedItems.length || !(locations.data ?? []).length) {
    return NextResponse.json({ suggestions: [] });
  }

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      system: `${ARIA_VOICE}

You are a warehouse optimization expert. Return ONLY valid JSON array, no markdown.`,
      messages: [{
        role: 'user',
        content: `Suggest optimal bin locations. High-velocity items should be in Zone A, low bay numbers (near dispatch). Low-velocity items can be in back zones.
Return JSON: [{"item_id":"id","item_name":"name","current_location":"label or null","suggested_zone":"A|B|C","suggested_reason":"brief reason","velocity_rank":"high|medium|low"}]

Items (sorted high→low velocity): ${JSON.stringify(rankedItems.slice(0, 15).map((i, idx) => ({ item_id: i.id, name: i.name, velocity: i.velocity, current_location: currentLocs[i.id]?.label ?? null, velocity_rank: idx < 5 ? 'high' : idx < 10 ? 'medium' : 'low' })))}
Zones available: ${JSON.stringify([...new Set((locations.data ?? []).map((l: any) => l.zone))])}`,
      }],
    });

    const raw = msg.content[0].type === 'text' ? msg.content[0].text : '';
    const arrMatch = raw.match(/\[[\s\S]*\]/);
    const suggestions = arrMatch ? JSON.parse(arrMatch[0]) : [];

    // Upsert slotting suggestions
    for (const s of suggestions) {
      await supabase.from('warehouse_slotting').upsert({
        business_id, item_id: s.item_id, item_name: s.item_name,
        reason: s.suggested_reason, applied: false,
        generated_at: new Date().toISOString(),
      }, { onConflict: 'business_id,item_id' }).then(() => null, () => null);
    }

    return NextResponse.json({ suggestions });
  } catch { return NextResponse.json({ suggestions: [] }); }
}
