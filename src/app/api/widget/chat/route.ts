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

interface ConvMessage { role: 'user' | 'assistant'; content: string; }

function err(msg: string, status = 500) {
  return NextResponse.json({ error: msg }, { status, headers: CORS });
}

export async function POST(req: Request) {
  // Guard: service role key required for widget (bypasses RLS for public endpoint)
  if (!supabaseAdmin) {
    console.error('[widget/chat] supabaseAdmin is null — SUPABASE_SERVICE_ROLE_KEY not set in Vercel env vars');
    return err('Service not configured. Contact the business owner.', 503);
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return err('AI not configured', 503);

  try {
    const apiKey = req.headers.get('x-widget-key');
    if (!apiKey) return err('Missing widget key', 401);

    // Look up widget config + business in one go
    const { data: config, error: cfgErr } = await supabaseAdmin
      .from('widget_configs')
      .select('*, businesses!inner(id, name, industry, address, city, phone, email, data_source)')
      .eq('api_key', apiKey)
      .single();

    if (cfgErr || !config?.enabled) {
      return err('Widget not found or disabled', 403);
    }

    const business = (config as any).businesses;
    const businessId = config.business_id;

    const { message, conversation_history = [], visitor_id } = await req.json();
    if (!message?.trim()) return err('Message required', 400);

    // ── Live inventory context ───────────────────────────────────────
    let inventoryContext = '';
    const dataSource = business?.data_source ?? 'aria_pos';
    const productTable = dataSource === 'square' ? 'square_items' : 'pos_products';
    const stockCol = dataSource === 'square' ? 'current_stock' : 'stock_quantity';

    const { data: products } = await supabaseAdmin
      .from(productTable)
      .select(`name, ${stockCol}, price${dataSource === 'aria_pos' ? ', cost_price' : ''}`)
      .eq('business_id', businessId)
      .eq(dataSource === 'square' ? 'track_inventory' : 'is_active', true)
      .order(stockCol, { ascending: false })
      .limit(30);

    if (products && products.length > 0) {
      const inStock = products.filter((p: any) => (p[stockCol] ?? 0) > 0);
      inventoryContext = `\n\nLIVE INVENTORY (in stock right now):\n${
        inStock.slice(0, 20).map((p: any) =>
          `• ${p.name}${p.price ? ` — A$${p.price}` : ''} (${p[stockCol]} in stock)`
        ).join('\n')
      }${inStock.length === 0 ? 'No items currently in stock.' : ''}`;
    }

    // ── Opening hours ────────────────────────────────────────────────
    let hoursContext = '';
    if (config.opening_hours && Object.keys(config.opening_hours).length > 0) {
      const days = Object.entries(config.opening_hours as Record<string, string>)
        .map(([day, hours]) => `${day}: ${hours}`).join(', ');
      hoursContext = `\n\nOPENING HOURS: ${days}`;
    }

    // ── FAQs ─────────────────────────────────────────────────────────
    let faqContext = '';
    if (Array.isArray(config.faqs) && config.faqs.length > 0) {
      faqContext = `\n\nFREQUENTLY ASKED QUESTIONS:\n${
        (config.faqs as { q: string; a: string }[])
          .map(f => `Q: ${f.q}\nA: ${f.a}`).join('\n\n')
      }`;
    }

    // ── System prompt ────────────────────────────────────────────────
    const systemPrompt = `You are ${config.bot_name ?? 'Aria'}, the friendly and knowledgeable AI assistant for ${business?.name}, a ${business?.industry} business${business?.city ? ` in ${business.city}, Australia` : ' in Australia'}.

Your job is to help customers with questions about this specific business. You have access to live data about what's in stock right now.${hoursContext}${inventoryContext}${config.services ? `\n\nSERVICES & PRODUCTS:\n${config.services}` : ''}${faqContext}

PERSONALITY:
- Warm, helpful, and professional — like a knowledgeable staff member
- Concise: 1-3 sentences unless the question genuinely needs more
- Use Australian English (e.g. "colour", "organise", "cheers")
- Be enthusiastic about the business's products and services

RULES:
- Only answer questions about ${business?.name} and its products/services
- If asked about stock, ONLY confirm items you can see in the inventory above
- Never give prices you're not certain of — say "please ask us in store for the latest pricing"
- Never discuss competitors
- If you genuinely can't help: "${config.escalation_message ?? `Please call us or visit us in store — we'd love to help!`}"
${config.guardrails ? `- Additional rules: ${config.guardrails}` : ''}

After your main reply, on a NEW LINE write exactly:
FOLLOWUP: "question 1"|"question 2"|"question 3"
These should be the 3 most natural follow-up questions a customer would ask next, based on the conversation so far.`;

    const anthropic = new Anthropic({ apiKey: anthropicKey });

    const messages: ConvMessage[] = [
      ...((conversation_history as ConvMessage[]).slice(-12)),
      { role: 'user', content: message },
    ];

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: systemPrompt,
      messages,
    });

    const rawReply = response.content[0].type === 'text' ? response.content[0].text : '';

    // Parse follow-up questions
    const followupMatch = rawReply.match(/\nFOLLOWUP:\s*(.+)$/m);
    let reply = rawReply;
    let suggestedQuestions: string[] = [];

    if (followupMatch) {
      reply = rawReply.replace(/\nFOLLOWUP:.*$/m, '').trim();
      suggestedQuestions = followupMatch[1]
        .split('|')
        .map(q => q.trim().replace(/^"|"$/g, ''))
        .filter(Boolean)
        .slice(0, 3);
    }

    // Fallback suggestions if Claude didn't provide them
    if (suggestedQuestions.length === 0) {
      suggestedQuestions = ['What are your opening hours?', 'What products do you have?', 'How can I contact you?'];
    }

    // Log conversation (fire-and-forget)
    if (visitor_id) {
      supabaseAdmin.from('widget_conversations').upsert({
        business_id: businessId,
        visitor_id,
        messages: [
          ...((conversation_history as ConvMessage[]).slice(-20)),
          { role: 'user', content: message },
          { role: 'assistant', content: reply },
        ],
        updated_at: new Date().toISOString(),
      }, { onConflict: 'business_id,visitor_id' }).then(() => null, () => null);
    }

    return NextResponse.json({ reply, suggested_questions: suggestedQuestions }, { headers: CORS });

  } catch (e: any) {
    console.error('[widget/chat] Error:', e?.message ?? e);
    return err(`Chat failed: ${e?.message ?? 'Unknown error'}`, 500);
  }
}
