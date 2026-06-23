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
import { guardOutput } from '@/lib/aria/ground-guard'

const GST_RATE = 0.10 // Australian GST

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Accept both field names for backwards compatibility
  const body = await req.json();
  const jobDescription = body.jobDescription ?? body.description;
  const { businessId, customerName, customerEmail, customerPhone } = body;

  if (!jobDescription) return NextResponse.json({ error: 'jobDescription required' }, { status: 400 });

  // Get active business if businessId not provided
  let bid = businessId;
  if (!bid) {
    const { data: active } = await supabase
      .from('user_active_business').select('business_id').eq('user_id', user.id).maybeSingle();
    bid = active?.business_id;
    if (!bid) {
      const { data } = await supabase.from('businesses').select('id').eq('user_id', user.id)
        .eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle();
      bid = data?.id;
    }
  }

  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 404 });

  const { data: business } = await supabase
    .from('businesses').select('*').eq('id', bid).eq('user_id', user.id).maybeSingle();

  if (!business) return NextResponse.json({ error: 'Business not found' }, { status: 404 });

  if (business.plan !== 'pro') return NextResponse.json({ error: 'Quote builder requires Pro plan' }, { status: 403 });

  const prompt = `Generate a professional quote for a ${business.industry} business called "${business.name}".

Job description: ${jobDescription}

Return a JSON object with this exact structure:
{
  "quoteNumber": "Q-${Date.now().toString().slice(-6)}",
  "businessName": "${business.name}",
  "date": "${new Date().toLocaleDateString('en-AU')}",
  "validUntil": "${new Date(Date.now() + 30 * 86400000).toLocaleDateString('en-AU')}",
  "lineItems": [
    { "description": "item description", "qty": 1, "rate": 0, "total": 0 }
  ],
  "notes": "payment terms and any notes",
  "terms": "standard terms"
}
Use realistic Australian pricing for the industry. Provide a qty and rate (ex-GST) for each line item.
Do NOT compute line totals, subtotal, GST or grand total — those are calculated server-side from your rates.
Do NOT state any dollar figure in notes/terms other than the line rates. Return ONLY the JSON.`;

  try {
    const _bizCtx = await getBusinessContext(bid)
  const _industry = (JSON.parse(_bizCtx))?.business?.industry ?? 'retail'
  const systemPrompt = getSystemPrompt(_industry as string, _bizCtx)
  const response =
await trackAICall({ route: 'aria/generate-quote', model: 'claude-sonnet-4-5-20250929', businessId: bid, purpose: 'quote-generate' }, () => anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1500,
      temperature: 0.2,
      system: [{ type: 'text' as const, text: systemPrompt, cache_control: { type: 'ephemeral' as const } }],
      messages: [{ role: 'user', content: prompt }],
    }));

    const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const { parseLLMJsonOr } = await import('@/lib/ai-json');
    const quoteData = parseLLMJsonOr<Record<string, unknown>>(text, {}, 'aria/generate-quote');
    if (!quoteData || Object.keys(quoteData).length === 0) {
      return NextResponse.json({ error: 'Could not parse Aria quote response' }, { status: 502 });
    }

    // FAB-FIX-2 — every dollar figure on a customer-facing quote is computed in code from the LLM's
    // qty/rate ONLY. The model never authors line totals, subtotal, GST or grand total (a wrong GST on a
    // customer quote is a legal/trust problem). Prose (notes/terms) is guarded against the computed figures.
    const rawItems = Array.isArray(quoteData.lineItems) ? quoteData.lineItems as Array<Record<string, unknown>> : [];
    const lineItems = rawItems.map(it => {
      const qty = Math.max(0, Number(it.qty) || 0);
      const rate = Math.max(0, Number(it.rate) || 0);
      return { description: String(it.description ?? '').slice(0, 300), qty, rate, total: Math.round(qty * rate * 100) / 100 };
    });
    const subtotal = Math.round(lineItems.reduce((s, it) => s + it.total, 0) * 100) / 100;
    const gst = Math.round(subtotal * GST_RATE * 100) / 100;
    const total = Math.round((subtotal + gst) * 100) / 100;
    const allowed = [subtotal, gst, total, ...lineItems.map(i => i.rate), ...lineItems.map(i => i.total)];
    // redact — a customer quote must never carry a fabricated $ figure, even if it's the only sentence.
    const notesGuard = await guardOutput(String(quoteData.notes ?? ''), allowed, { mode: 'redact', businessId: bid, surface: 'generate-quote:notes' });
    const termsGuard = await guardOutput(String(quoteData.terms ?? ''), allowed, { mode: 'redact', businessId: bid, surface: 'generate-quote:terms' });

    const quote = {
      quoteNumber: String(quoteData.quoteNumber ?? `Q-${Date.now().toString().slice(-6)}`),
      businessName: business.name,
      date: new Date().toLocaleDateString('en-AU'),
      validUntil: new Date(Date.now() + 30 * 86400000).toLocaleDateString('en-AU'),
      lineItems, subtotal, gst, total,
      notes: notesGuard.text,
      terms: termsGuard.text,
    };

    // Save to quotes table
    const { data: saved, error: saveErr } = await supabase
      .from('quotes')
      .insert({
        business_id: bid,
        customer_name: customerName ?? null,
        customer_email: customerEmail ?? null,
        customer_phone: customerPhone ?? null,
        job_description: jobDescription,
        quote_amount: total,
        quote_breakdown: quote,
        status: 'draft',
        generated_by_ai: true,
        generated_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
      })
      .select()
      .single();

    if (saveErr) {
      // Table may not exist yet — return quote without saving
      console.error('Quote save error:', saveErr.message);
      return NextResponse.json({ quote, saved: false });
    }

    await writeAriaOutcome(bid, 'quote-generated', `Quote ${quote.quoteNumber} — ${jobDescription.slice(0, 80)}`).catch(() => null);
    return NextResponse.json({ quote, id: saved.id, saved: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: active } = await supabase
    .from('user_active_business').select('business_id').eq('user_id', user.id).maybeSingle();
  const bid = active?.business_id
    ?? (await supabase.from('businesses').select('id').eq('user_id', user.id)
        .eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()).data?.id;

  if (!bid) return NextResponse.json({ quotes: [] });

  const { data: quotes } = await supabase
    .from('quotes')
    .select('*')
    .eq('business_id', bid)
    .order('created_at', { ascending: false })
    .limit(50);

  return NextResponse.json({ quotes: quotes ?? [] });
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  // Resolve bid for ownership check
  const { data: active } = await supabase
    .from('user_active_business').select('business_id').eq('user_id', user.id).maybeSingle();
  const bid = active?.business_id
    ?? (await supabase.from('businesses').select('id').eq('user_id', user.id)
        .eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()).data?.id;
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 404 });

  const body = await req.json();
  const { error } = await supabase
    .from('quotes')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('business_id', bid);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export const GET = withErrorCapture('aria/generate-quote', _GET)
export const POST = withErrorCapture('aria/generate-quote', _POST)
export const PATCH = withErrorCapture('aria/generate-quote', _PATCH)
