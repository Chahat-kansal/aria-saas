export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import Anthropic from '@anthropic-ai/sdk'
import { trackAICall } from '@/lib/aria/ai-telemetry'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

interface Message { role: 'user' | 'assistant'; content: string }
interface ProductCard { id: string; name: string; price: number | null; stock: number; image_url: string | null }

const PERSONALITY_TONE: Record<string, string> = {
  friendly: 'Warm, upbeat, casual Australian. Like the best staff member on their best day. Light humour where it fits, never forced. Celebrate the customer ("good pick", "great question"). Never sarcastic.',
  witty:    'Warm and a touch playful. More jokes, but always kind and never at the customer\'s expense. Quick, light, Australian. "Pressure\'s on the conversation now though." style.',
  professional: 'Warm but minimal humour. Concise, helpful, accurate. Still genuinely human — not a corporate bot.',
}

function extractProductMentions(text: string, products: Array<{ name: string; id: string }>) {
  const lower = text.toLowerCase()
  return products.filter(p => p.name && lower.includes(p.name.toLowerCase()))
}

export async function POST(req: Request) {
  try {
    const { business_id, message, conversation_id, visitor_id, messages: history = [] } = await req.json() as {
      business_id: string
      message: string
      conversation_id?: string
      visitor_id?: string
      messages?: Message[]
    }

    if (!business_id || !message) {
      return NextResponse.json({ error: 'business_id and message required' }, { status: 400 })
    }

    // ── Load kiosk config (auto-create if missing) ────────────────────
    let { data: config } = await supabaseAdmin
      .from('instore_kiosk_configs')
      .select('*')
      .eq('business_id', business_id)
      .maybeSingle()

    if (!config) {
      const { data: created } = await supabaseAdmin
        .from('instore_kiosk_configs')
        .insert({ business_id })
        .select('*')
        .single()
      config = created
    }

    if (config && config.enabled === false) {
      return NextResponse.json({ error: 'Kiosk is disabled' }, { status: 403 })
    }

    // ── Load business + product catalogue ─────────────────────────────
    const [bizRes, prodRes] = await Promise.all([
      supabaseAdmin.from('businesses').select('name, industry, city').eq('id', business_id).maybeSingle(),
      supabaseAdmin.from('pos_products')
        .select('id, name, price, stock_quantity, track_stock, description, image_url, pos_categories(name)')
        .eq('business_id', business_id)
        .eq('is_active', true)
        .order('name')
        .limit(80),
    ])

    const biz = bizRes.data as { name?: string | null; industry?: string | null; city?: string | null } | null
    type DBProduct = { id: string; name: string; price: number | null; stock_quantity: number | null; track_stock: boolean | null; description: string | null; image_url: string | null; pos_categories?: { name?: string | null } | null }
    const products = (prodRes.data ?? []) as DBProduct[]

    const productList = products.map(p => {
      const qty = Number(p.stock_quantity ?? 0)
      const tracked = p.track_stock !== false
      const stockNote = !tracked ? '' : qty === 0 ? ' (out of stock)' : qty <= 3 ? ' (low stock)' : ' (in stock)'
      const priceBit = p.price != null ? ' — A$' + Number(p.price).toFixed(2) : ''
      const catBit = p.pos_categories?.name ? ' [' + p.pos_categories.name + ']' : ''
      return p.name + priceBit + catBit + stockNote
    }).join('\n')

    // ── Build system prompt ───────────────────────────────────────────
    const personality = config?.personality ?? 'friendly'
    const tone = PERSONALITY_TONE[personality] ?? PERSONALITY_TONE.friendly

    const systemPrompt = [
      `You are ${config?.kiosk_name ?? 'Aria'}, the in-store assistant for ${biz?.name ?? 'this shop'}${biz?.city ? ' in ' + biz.city : ''} — an Australian ${biz?.industry ?? 'shop'}.`,
      `Tone: ${tone}`,
      'You are speaking to a customer who is IN the shop right now, on a tablet or their phone.',
      'Keep replies SHORT — a few sentences max. People are standing in a shop, not reading an essay.',
      '',
      'PRODUCTS IN STOCK RIGHT NOW (only mention these — never invent products, prices or stock):',
      productList || 'No products loaded yet — apologise warmly and suggest asking a staff member.',
      '',
      'If a customer asks for something not in the list above, say honestly that you don\'t have it,',
      'apologise warmly, and suggest the closest alternative you DO have.',
      'Never make up products, prices, or stock numbers.',
      'Celebrate the customer\'s taste when they pick something good.',
      'When recommending, name 1-2 specific products from the list above.',
    ].filter(Boolean).join('\n')

    // ── Call Claude (Haiku for speed) ─────────────────────────────────
    const msgs: Message[] = [
      ...history.slice(-8),
      { role: 'user', content: message },
    ]

    const response = await trackAICall(
      { route: 'public/instore/chat', model: 'claude-haiku-4-5-20251001', businessId: business_id, purpose: 'instore-kiosk' },
      () => anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: systemPrompt,
        messages: msgs,
      })
    )

    const replyText = response.content[0].type === 'text' ? response.content[0].text : ''

    // ── Build product cards mentioned in the reply ─────────────────────
    const mentioned = extractProductMentions(replyText, products.map(p => ({ name: p.name, id: p.id })))
    const productCards: ProductCard[] = mentioned.slice(0, 4).map(m => {
      const p = products.find(pp => pp.id === m.id)!
      return {
        id: p.id,
        name: p.name,
        price: p.price != null ? Number(p.price) : null,
        stock: Number(p.stock_quantity ?? 0),
        image_url: p.image_url,
      }
    })

    // ── Lightweight demand-signal extraction ──────────────────────────
    // Did the customer ask for a product? Check the user's message against catalogue.
    const lowerMsg = message.toLowerCase()
    const asked = products.find(p => p.name && lowerMsg.includes(p.name.toLowerCase()))
    let signal_type: 'answered' | 'missed_demand' | 'recommendation' | 'recipe' = 'answered'
    let product_asked: string | null = null
    let matched_product_id: string | null = null
    let in_stock: boolean | null = null

    if (asked) {
      const qty = Number(asked.stock_quantity ?? 0)
      const tracked = asked.track_stock !== false
      in_stock = !tracked || qty > 0
      matched_product_id = asked.id
      product_asked = asked.name
      signal_type = 'answered'
    } else {
      // Heuristic: "do you have X", "got any X", "where is your X", "looking for X"
      const askPatterns = /(do you have|got any|looking for|where('?s| is) (the |your )?|need|sell|stock|carry)\s+([a-z0-9\s'-]{3,40})/i
      const m = message.match(askPatterns)
      if (m && m[6]) {
        product_asked = m[6].trim().replace(/[?.!,]+$/, '').slice(0, 80)
        in_stock = false
        signal_type = 'missed_demand'
      }
    }

    if (/recipe|how (do|to) (i )?(make|cook)|dinner|lunch|breakfast/i.test(message)) {
      signal_type = 'recipe'
    } else if (/recommend|suggest|what should|what would you|best|good for/i.test(message) && signal_type === 'answered') {
      signal_type = 'recommendation'
    }

    await supabaseAdmin.from('instore_demand_signals').insert({
      business_id,
      query_text: message.slice(0, 500),
      product_asked,
      in_stock,
      matched_product_id,
      signal_type,
    })

    // ── Save / update conversation ────────────────────────────────────
    const updatedMessages = [
      ...history,
      { role: 'user', content: message },
      { role: 'assistant', content: replyText },
    ]

    let convId = conversation_id ?? null
    if (convId) {
      await supabaseAdmin.from('instore_conversations').update({
        messages: updatedMessages,
      }).eq('id', convId)
    } else {
      const { data: newConv } = await supabaseAdmin.from('instore_conversations').insert({
        business_id,
        messages: updatedMessages,
      }).select('id').single()
      convId = newConv?.id ?? null
    }

    return NextResponse.json({
      reply: replyText,
      conversation_id: convId,
      product_cards: productCards,
      visitor_id: visitor_id ?? null,
    })
  } catch (err) {
    console.error('[instore/chat] error', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
