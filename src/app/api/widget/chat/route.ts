import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '@/lib/supabase';
import { getBusinessItems, getBusinessSales, type Item } from '@/lib/business-data';
import { buildWebsiteAssistantContext, buildProductContext } from '@/lib/aria/website-assistant-data';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-widget-key',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

function err(msg: string, status = 500) {
  return NextResponse.json({ error: msg }, { status, headers: CORS });
}

// ── Intent classification ────────────────────────────────────────
function classifyIntent(message: string): string {
  const m = message.toLowerCase();
  if (/\b(menu|what.*(eat|drink|food|coffee|serve)|do you do|what.*(have|offer|sell))\b/.test(m)) return 'MENU_QUERY';
  if (/\b(have|got|stock|available|in stock|carry|sell|do you)\b/.test(m)) return 'STOCK_QUERY';
  if (/\b(what|show|list|range|selection|types?|kinds?|varieties|products?|items?)\b/.test(m)) return 'PRODUCT_SEARCH';
  if (/\b(price|cost|how much|charge|expensive|cheap|afford|dollar|\$)\b/.test(m)) return 'PRICE_QUERY';
  if (/\b(recommend|suggest|popular|best|favourite|good|like|enjoy|try|love|what.*should)\b/.test(m)) return 'RECOMMENDATION';
  if (/\b(open|close|hours|time|when|today|sunday|monday|tuesday|wednesday|thursday|friday|saturday|weekend|holiday)\b/.test(m)) return 'HOURS_INFO';
  if (/\b(order|deliver|delivery|pickup|collect|online|click|ship|post)\b/.test(m)) return 'ORDER_HELP';
  return 'GENERAL';
}

function findMatchingItems(query: string, items: Item[]): Item[] {
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  return items.filter(item => {
    const name = item.name.toLowerCase();
    return words.some(w => name.includes(w));
  }).slice(0, 10);
}

function buildTopSellingContext(sales: Awaited<ReturnType<typeof getBusinessSales>>, items: Item[]): string {
  const counts: Record<string, number> = {};
  for (const sale of sales) {
    for (const li of sale.lineItems) {
      counts[li.itemId] = (counts[li.itemId] ?? 0) + li.quantity;
    }
  }
  const top = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, qty]) => {
      const item = items.find(i => i.id === id || i.externalId === id);
      return item ? `${item.name}: ${qty} sold this week` : null;
    })
    .filter(Boolean);
  return top.length > 0 ? `Top sellers this week: ${top.join(', ')}` : '';
}

function buildIntentContext(intent: string, message: string, items: Item[], hours: Record<string, string>): string {
  switch (intent) {
    case 'STOCK_QUERY': {
      const matches = findMatchingItems(message, items);
      if (matches.length === 0) return 'No items matching that query found in our catalogue.';
      return 'Stock levels for matching items:\n' + matches.map(i =>
        `• ${i.name}: ${i.currentStock > 0 ? `${i.currentStock} in stock` : 'OUT OF STOCK'}${i.priceCents > 0 ? `, A$${(i.priceCents / 100).toFixed(2)}` : ''}`
      ).join('\n');
    }
    case 'PRICE_QUERY': {
      const matches = findMatchingItems(message, items);
      return matches.length > 0
        ? 'Pricing for matching items:\n' + matches.map(i =>
            `• ${i.name}: ${i.priceCents > 0 ? `A$${(i.priceCents / 100).toFixed(2)}` : 'price on enquiry'}${i.currentStock <= 0 ? ' (OUT OF STOCK)' : ''}`
          ).join('\n')
        : 'Specific item not found. General pricing available in store.';
    }
    case 'PRODUCT_SEARCH': {
      const cats: Record<string, Item[]> = {};
      items.forEach(i => {
        const cat = i.category ?? 'General';
        if (!cats[cat]) cats[cat] = [];
        cats[cat].push(i);
      });
      const inStock = items.filter(i => i.currentStock > 0);
      return `We carry ${items.length} products (${inStock.length} currently in stock).\n` +
        Object.entries(cats).slice(0, 6).map(([cat, its]) =>
          `${cat}: ${its.length} items — e.g. ${its.slice(0, 3).map(i => i.name).join(', ')}`
        ).join('\n');
    }
    case 'RECOMMENDATION': {
      const topItems = items
        .filter(i => i.currentStock > 0)
        .sort((a, b) => b.currentStock - a.currentStock)
        .slice(0, 5);
      return topItems.length > 0
        ? 'Popular items currently in stock:\n' + topItems.map(i =>
            `• ${i.name}${i.priceCents > 0 ? ` — A$${(i.priceCents / 100).toFixed(2)}` : ''}`
          ).join('\n')
        : 'Ask our staff for personalised recommendations.';
    }
    case 'HOURS_INFO': {
      if (Object.keys(hours).length === 0) return 'Opening hours information is in the business details below.';
      return 'Opening hours:\n' + Object.entries(hours).map(([d, h]) => `${d}: ${h}`).join('\n');
    }
    default:
      return '';
  }
}

export async function POST(req: Request) {
  if (!supabaseAdmin) {
    console.error('[widget/chat] supabaseAdmin null — SUPABASE_SERVICE_ROLE_KEY not set');
    return err('Service not configured.', 503);
  }
  if (!process.env.ANTHROPIC_API_KEY) return err('AI not configured', 503);

  try {
    const apiKey = req.headers.get('x-widget-key');
    if (!apiKey) return err('Missing widget key', 401);

    // Domain whitelist check
    const origin = req.headers.get('origin') ?? '';

    const { data: config, error: cfgErr } = await supabaseAdmin
      .from('widget_configs')
      .select('*')
      .eq('api_key', apiKey)
      .single();

    if (cfgErr || !config?.enabled) return err('Widget not found or disabled', 403);

    if (config.allowed_domain && origin && !origin.includes(config.allowed_domain)) {
      return err('Domain not allowed', 403);
    }

    const businessId: string = config.business_id;

    const { data: business } = await supabaseAdmin
      .from('businesses')
      .select('name, industry, address, city, phone, email, data_source')
      .eq('id', businessId)
      .single();
    if (!business) return err('Business not found', 404);

    const { message, visitor_id } = await req.json();
    if (!message?.trim()) return err('Message required', 400);

    // Load existing conversation from DB (server-side persistence)
    let serverHistory: { role: string; content: string }[] = [];
    if (visitor_id) {
      const { data: conv } = await supabaseAdmin
        .from('widget_conversations')
        .select('messages')
        .eq('business_id', businessId)
        .eq('visitor_id', visitor_id)
        .maybeSingle();
      if (conv?.messages && Array.isArray(conv.messages)) {
        serverHistory = (conv.messages as any[]).slice(-10);
      }
    }

    // ── Intent-based data fetch ──────────────────────────────────
    const dataSource = (business.data_source ?? 'aria_pos') as 'square' | 'aria_pos';
    const intent = classifyIntent(message);

    // Build enriched context (includes recipes/menu for cafes/restaurants)
    const assistantCtx = await buildWebsiteAssistantContext(businessId, config);
    const enrichedIntentContext = buildProductContext(intent, message, assistantCtx);

    // Fall back to legacy item-based context if enriched context is empty
    let items: Item[] = [];
    let salesContext = '';
    let intentContext = enrichedIntentContext;

    if (!enrichedIntentContext && ['STOCK_QUERY', 'PRICE_QUERY', 'PRODUCT_SEARCH', 'RECOMMENDATION'].includes(intent)) {
      items = await getBusinessItems(businessId, dataSource);
    }

    if (intent === 'RECOMMENDATION' && !enrichedIntentContext) {
      try {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const sales = await getBusinessSales(businessId, sevenDaysAgo, dataSource);
        salesContext = buildTopSellingContext(sales, items);
      } catch { /* non-critical */ }
    }

    if (!intentContext) {
      const hours = (config.opening_hours as Record<string, string>) ?? {};
      intentContext = buildIntentContext(intent, message, items, hours);
    }

    // ── FAQs ────────────────────────────────────────────────────
    const faqContext = Array.isArray(config.faqs) && config.faqs.length > 0
      ? '\n\nFAQs:\n' + (config.faqs as { q: string; a: string }[]).map(f => `Q: ${f.q}\nA: ${f.a}`).join('\n')
      : '';

    // ── System prompt ────────────────────────────────────────────
    const systemPrompt = `You are ${config.bot_name ?? 'Aria'}, the friendly AI assistant for ${business.name}, a ${business.industry} business${business.city ? ` in ${business.city}, Australia` : ' in Australia'}.

INTENT DETECTED: ${intent}
${intentContext ? '\nREAL-TIME DATA FOR THIS QUERY:\n' + intentContext : ''}
${salesContext ? '\n' + salesContext : ''}
${config.services ? '\nSERVICES: ' + config.services : ''}${faqContext}

PERSONALITY: Warm, knowledgeable, concise (1-3 sentences). Australian English. Enthusiastic about products.

RULES:
- Only reference items, prices and stock counts shown in the REAL-TIME DATA above
- Never invent prices or stock levels
- If item is OUT OF STOCK, say so honestly and suggest alternatives if any are in stock
- If asked about a specific item that IS in stock, proactively suggest 1-2 complementary items also in stock
- ${config.escalation_message ?? 'If you cannot help, say: "Please call or visit us in store — we\'d love to help!"'}
${config.guardrails ? '- ' + config.guardrails : ''}

After your reply, write on a new line:
FOLLOWUP: "question 1"|"question 2"|"question 3"`;

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const messages = [
      ...serverHistory.filter(m => m.role === 'user' || m.role === 'assistant').slice(-10).map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user' as const, content: message },
    ];

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: systemPrompt,
      messages,
    });

    const rawReply = response.content[0].type === 'text' ? response.content[0].text : '';
    const followupMatch = rawReply.match(/\nFOLLOWUP:\s*(.+)$/m);
    let reply = rawReply;
    let suggestedQuestions: string[] = [];

    if (followupMatch) {
      reply = rawReply.replace(/\nFOLLOWUP:.*$/m, '').trim();
      suggestedQuestions = followupMatch[1].split('|').map(q => q.trim().replace(/^"|"$/g, '')).filter(Boolean).slice(0, 3);
    }

    if (suggestedQuestions.length === 0) {
      suggestedQuestions = intent === 'STOCK_QUERY'
        ? ['Do you have anything similar?', 'What are your opening hours?', 'Can I place an order?']
        : ['What else do you have in stock?', 'What are your opening hours?', 'How can I contact you?'];
    }

    // Persist conversation server-side
    if (visitor_id) {
      const updatedMessages = [
        ...serverHistory.slice(-18),
        { role: 'user', content: message, intent, timestamp: new Date().toISOString() },
        { role: 'assistant', content: reply, timestamp: new Date().toISOString() },
      ];
      supabaseAdmin.from('widget_conversations').upsert({
        business_id: businessId, visitor_id,
        messages: updatedMessages,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'business_id,visitor_id' }).then(() => null, () => null);
    }

    return NextResponse.json({ reply, suggested_questions: suggestedQuestions, intent }, { headers: CORS });

  } catch (e: any) {
    console.error('[widget/chat] Error:', e?.message);
    return err('Chat failed: ' + (e?.message ?? 'Unknown error'), 500);
  }
}
