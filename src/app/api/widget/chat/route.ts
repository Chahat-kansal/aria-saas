import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-widget-key',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

interface ConvMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function POST(req: Request) {
  try {
    const apiKey = req.headers.get('x-widget-key');
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing widget key' }, { status: 401 , headers: CORS });
    }

    // Look up widget config
    const { data: config } = await supabaseAdmin
      .from('widget_configs')
      .select('*')
      .eq('api_key', apiKey)
      .single();

    if (!config || !config.enabled) {
      return NextResponse.json({ error: 'Widget not found or disabled' }, { status: 403 , headers: CORS });
    }

    const { message, conversation_history = [], visitor_id } = await req.json();
    if (!message?.trim()) {
      return NextResponse.json({ error: 'Message required' }, { status: 400 , headers: CORS });
    }

    // Fetch business for context
    const { data: business } = await supabaseAdmin
      .from('businesses')
      .select('name, industry, address, city, phone, email')
      .eq('id', config.business_id)
      .single();

    if (!business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 , headers: CORS });
    }

    // For retail/cafe, pull top products for inventory context
    let productContext = '';
    if (['retail', 'cafe'].includes(business.industry ?? '')) {
      const { data: products } = await supabaseAdmin
        .from('pos_products')
        .select('name, stock_quantity')
        .eq('business_id', config.business_id)
        .order('stock_quantity', { ascending: false })
        .limit(20);

      if (products && products.length > 0) {
        productContext = `\nCurrent products (top by stock): ${products.map((p: { name: string; stock_quantity: number }) => `${p.name} (${p.stock_quantity} in stock)`).join(', ')}.`;
      }
    }

    // Build FAQs string
    const faqs = Array.isArray(config.faqs) && config.faqs.length > 0
      ? `\nFAQs:\n${(config.faqs as { q: string; a: string }[]).map((f) => `Q: ${f.q}\nA: ${f.a}`).join('\n')}`
      : '';

    // Build opening hours string
    const hours = config.opening_hours && Object.keys(config.opening_hours).length > 0
      ? `\nOpening hours: ${JSON.stringify(config.opening_hours)}`
      : '';

    const systemPrompt = `You are ${config.bot_name}, the AI assistant for ${business.name}, a ${business.industry} business located at ${[business.address, business.city].filter(Boolean).join(', ') || 'Australia'}.${hours}${config.services ? `\nServices/products: ${config.services}` : ''}${productContext}${faqs}

RULES:
- Never make up information you don't have.
- If you cannot confidently answer, say: "${config.escalation_message || 'Please contact us directly for more information.'}"
- Never discuss competitor businesses.
- Never give pricing you are not certain of.
${config.guardrails ? `- ${config.guardrails}` : ''}
- Keep responses under 3 sentences unless a longer answer is clearly needed.
- Be friendly, helpful, and professional.
- After your reply, on a new line write: SUGGESTED: followed by exactly 3 comma-separated follow-up questions the visitor might ask, in quotes, e.g. SUGGESTED: "What are your prices?","Do you offer delivery?","How can I book?"`;

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
      return NextResponse.json({ error: 'AI not configured' }, { status: 500 , headers: CORS });
    }

    const anthropic = new Anthropic({ apiKey: anthropicKey });

    const messages: ConvMessage[] = [
      ...((conversation_history as ConvMessage[]).slice(-10)), // last 10 turns only
      { role: 'user', content: message },
    ];

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: systemPrompt,
      messages,
    });

    const rawReply = response.content[0].type === 'text' ? response.content[0].text : '';

    // Parse SUGGESTED questions out of reply
    const suggestedMatch = rawReply.match(/SUGGESTED:\s*(.+)$/m);
    let suggestedQuestions: string[] = [];
    let reply = rawReply;

    if (suggestedMatch) {
      reply = rawReply.replace(/\nSUGGESTED:.*$/m, '').trim();
      suggestedQuestions = suggestedMatch[1]
        .match(/"([^"]+)"/g)
        ?.map(s => s.replace(/"/g, '')) ?? [];
    }

    // Log conversation (fire-and-forget, use service role to bypass RLS)
    if (visitor_id) {
      const updatedMessages = [
        ...((conversation_history as ConvMessage[]).slice(-20)),
        { role: 'user', content: message },
        { role: 'assistant', content: reply },
      ];

      await supabaseAdmin
        .from('widget_conversations')
        .upsert(
          {
            business_id: config.business_id,
            visitor_id,
            messages: updatedMessages,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'business_id,visitor_id' }
        )
        .catch(() => null); // never fail the response due to logging
    }

    return NextResponse.json({ reply, suggested_questions: suggestedQuestions }, { headers: CORS });
  } catch (err) {
    console.error('Widget chat error:', err);
    return NextResponse.json({ error: 'Chat failed' }, { status: 500 , headers: CORS });
  }
}