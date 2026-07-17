export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { waitUntil } from '@vercel/functions';
import { withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture';

interface ParcelRow { carrier: string | null; created_at: string; delivered_at: string | null }

async function _POST(req: Request, _context: unknown, { supabase, businessId: bid }: BusinessContext) {
  const { parcel_id } = await req.json();
  if (!parcel_id) return NextResponse.json({ error: 'parcel_id required' }, { status: 400 });

  const { data: parcel } = await supabase.from('pos_parcel_tracking')
    .select('id, carrier, carrier_name, status, created_at, last_event_at, events')
    .eq('id', parcel_id).eq('business_id', bid).maybeSingle();
  if (!parcel) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // Build carrier history baseline
  const { data: history } = await supabase.from('pos_parcel_tracking')
    .select('carrier, created_at, delivered_at')
    .eq('business_id', bid).eq('carrier', parcel.carrier).eq('status', 'delivered').limit(50);

  const days = ((history ?? []) as ParcelRow[])
    .filter(p => p.delivered_at)
    .map(p => (new Date(p.delivered_at!).getTime() - new Date(p.created_at).getTime()) / 86400_000)
    .filter(d => d > 0 && d < 60);
  const avgDays = days.length > 0 ? days.reduce((a, b) => a + b, 0) / days.length : 5;

  let prediction = '';
  let inputTokens = 0, outputTokens = 0, success = false;
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 });
    const res = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      temperature: 0.2,
      system: 'You are a parcel delivery predictor for Australian small business. Plain prose, one sentence with the most likely delivery day.',
      messages: [{ role: 'user', content: `Carrier: ${parcel.carrier_name}\nShipped: ${parcel.created_at}\nLast scan: ${parcel.last_event_at ?? 'none'}\nStatus: ${parcel.status}\nCarrier average delivery: ${avgDays.toFixed(1)} days based on ${days.length} past parcels\nRecent events: ${JSON.stringify((parcel.events ?? []).slice(0, 3))}\n\nWhen is this most likely to arrive? One short sentence.` }],
    });
    prediction = res.content.filter((b: { type: string; text?: string }) => b.type === 'text').map((b: { type: string; text?: string }) => b.text ?? '').join('').trim();
    inputTokens = res.usage.input_tokens;
    outputTokens = res.usage.output_tokens;
    success = true;
  } catch (e) { console.error('[delivery-prediction] AI failed:', (e as Error).message); }

  waitUntil((async () => {
    try {
      await supabaseAdmin.from('aria_ai_calls').insert({
        business_id: bid, agent_key: 'delivery_prediction', provider: 'anthropic',
        model_id: 'claude-haiku-4-5-20251001', role: 'forecast',
        input_tokens: inputTokens, output_tokens: outputTokens, success,
      });
    } catch (e) { console.error('[non-fatal]', e) }
  })());

  return NextResponse.json({ prediction, baseline_days: Math.round(avgDays * 10) / 10, sample_size: days.length });
}

export const POST = withBusinessContext('aria/delivery-prediction', _POST);
