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

function sseLine(obj: unknown): string {
  return 'data: ' + JSON.stringify(obj) + '\n\n'
}

// Defensive safety net for the "never stall" rule. Conservative — matches only
// explicit stall language to avoid false positives ("Let me know if..." stays fine).
const STALL_REGEX = /\b(let me check|give me (a sec|just a sec|a moment|one sec)|hold on|one moment|let me grab|let me look|let me find out|just a sec|wait a sec)\b/i

// First N chars buffered before flushing — long enough to catch a "Let me check..."
// opener, short enough that the customer barely notices the buffer delay.
const STALL_BUFFER_CHARS = 60

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

    // ── Optional member lookup if customer pasted an email ────────────
    let memberContext = ''
    const emailMatch = message.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)
    if (config?.loyalty_enabled !== false && emailMatch) {
      const { data: cust } = await supabaseAdmin.from('pos_customers')
        .select('name, loyalty_points, points_balance, stamps_count')
        .eq('business_id', business_id)
        .eq('email', emailMatch[0].toLowerCase().trim())
        .maybeSingle()
      if (cust) {
        const pts = Number(cust.points_balance ?? cust.loyalty_points ?? 0)
        const stamps = Number(cust.stamps_count ?? 0)
        memberContext = `RETURNING CUSTOMER: ${cust.name ?? 'this customer'} is enrolled — ${pts} points, ${stamps} stamps. Greet them by name warmly. Never invent any numbers.`
      }
    }

    // ── Build system prompt ───────────────────────────────────────────
    const personality = config?.personality ?? 'friendly'
    const tone = PERSONALITY_TONE[personality] ?? PERSONALITY_TONE.friendly

    const greeting = config?.greeting ? `Greeting style: "${config.greeting}".` : ''
    const systemPrompt = [
      `You are ${config?.kiosk_name ?? 'Aria'}, the in-store assistant for ${biz?.name ?? 'this shop'}${biz?.city ? ' in ' + biz.city : ''} — an Australian ${biz?.industry ?? 'shop'}.`,
      `Tone & personality: ${tone}`,
      greeting,
      'You are speaking to a customer who is IN the shop right now, on a tablet or their phone.',
      'Keep replies SHORT — a few sentences max. People are standing in a shop, not reading an essay.',
      'NEVER sarcastic. NEVER make the customer feel dumb. If they ask something silly, play along kindly.',
      'When you recommend, recommend with ENTHUSIASM — like a staff member who genuinely loves the product.',
      '',
      'CRITICAL: NEVER stall. NEVER say "let me check", "give me a sec", "let me grab the list", "hold on", "one moment", or any variation. You already have the FULL product list below — answer immediately, in ONE reply. You are not fetching anything. You are not looking anything up. The data is right there in your system prompt — use it now.',
      'If you don\'t know something, say so honestly in the same reply and recommend the closest thing you DO have. Never promise a follow-up message.',
      'Examples of good lines: "Good pick!" / "Ooh, great question." / "Honestly the [X] is the one — I\'d recommend it even if no one was asking."',
      '',
      'PRODUCTS IN STOCK RIGHT NOW (only mention these — never invent products, prices or stock):',
      productList || 'No products loaded yet — apologise warmly and suggest asking a staff member.',
      '',
      'If a customer asks for something not in the list above, say honestly that you don\'t have it,',
      'apologise warmly, and suggest the closest alternative you DO have.',
      'Never make up products, prices, or stock numbers.',
      'When recommending, name 1-2 specific products from the list above by their exact name so we can show product cards.',
      'UPSELL RULE: at most ONE natural pairing suggestion per topic — only if it feels genuinely helpful. Never pushy. ("A flat white? The almond croissant is the local legend with that.")',
      'If a customer asks for recipe ideas or what to cook, give them one good idea using your stock, in one short reply. A recipe card may also be rendered separately.',
      memberContext,
      config?.loyalty_enabled !== false
        ? 'LOYALTY: If the customer seems happy or wrapping up, you may warmly offer to sign them up for loyalty in ONE short sentence (e.g. "Want a free coffee on your 10th visit? Drop your email and I\'ll set you up."). Only ask once per conversation. Never push.'
        : '',
    ].filter(Boolean).join('\n')

    // ── Build message history for Claude ──────────────────────────────
    const msgs: Message[] = [
      ...history.slice(-8),
      { role: 'user', content: message },
    ]

    // ── Stream the response via SSE ───────────────────────────────────
    const encoder = new TextEncoder()
    const startedAt = Date.now()

    // Stream one Claude reply into the SSE controller, buffering the first
    // STALL_BUFFER_CHARS so we can swap to a retry before the client sees a stall.
    async function streamOneReply(
      controller: ReadableStreamDefaultController<Uint8Array>,
      systemPromptToUse: string,
    ): Promise<string> {
      let buffered = ''
      let flushed = false
      let stallDetected = false

      const claudeStream = anthropic.messages.stream({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: systemPromptToUse,
        messages: msgs,
      })

      for await (const event of claudeStream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          const token = event.delta.text
          if (!token) continue
          buffered += token
          if (!flushed) {
            if (buffered.length >= STALL_BUFFER_CHARS) {
              if (STALL_REGEX.test(buffered)) {
                stallDetected = true
                break
              }
              // Looks safe — flush all buffered text in one chunk, then stream live
              controller.enqueue(encoder.encode(sseLine({ type: 'token', text: buffered })))
              flushed = true
            }
          } else {
            controller.enqueue(encoder.encode(sseLine({ type: 'token', text: token })))
          }
        }
      }

      if (stallDetected) {
        // Don't leak any text to the client — signal to caller for a retry
        return ' STALL'
      }

      // Stream ended before we hit the buffer threshold — flush whatever we have
      if (!flushed && buffered) {
        // Final stall check on the short reply too
        if (STALL_REGEX.test(buffered)) return ' STALL'
        controller.enqueue(encoder.encode(sseLine({ type: 'token', text: buffered })))
      }
      return buffered
    }

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let replyText = ''
        try {
          replyText = await streamOneReply(controller, systemPrompt)

          if (replyText === ' STALL') {
            // Retry with an explicit anti-stall correction in the system prompt
            console.warn('[instore/chat] stall detected, retrying', { business_id })
            await supabaseAdmin.from('aria_ai_calls').insert({
              business_id,
              route: 'public/instore/chat',
              model: 'claude-haiku-4-5-20251001',
              purpose: 'instore-kiosk-stall-detected',
              status: 'retry',
            }).then(undefined, () => null)

            const correctedPrompt = systemPrompt + '\n\nYour previous reply contained a stall phrase. The product catalogue is RIGHT HERE. Answer the customer NOW using the catalogue. Never write "let me check" or "give me a sec".'
            replyText = await streamOneReply(controller, correctedPrompt)

            if (replyText === ' STALL') {
              // Second stall — emit a hardcoded helpful fallback
              const fallback = "Honestly, your best bet right now is asking the staff — they'll know."
              controller.enqueue(encoder.encode(sseLine({ type: 'token', text: fallback })))
              replyText = fallback
              await supabaseAdmin.from('aria_ai_calls').insert({
                business_id,
                route: 'public/instore/chat',
                model: 'claude-haiku-4-5-20251001',
                purpose: 'instore-kiosk-stall-fallback',
                status: 'fallback',
              }).then(undefined, () => null)
            }
          }

          // Log the AI call for telemetry (matches the previous trackAICall instrumentation)
          await trackAICall(
            { route: 'public/instore/chat', model: 'claude-haiku-4-5-20251001', businessId: business_id, purpose: 'instore-kiosk' },
            async () => ({ durationMs: Date.now() - startedAt })
          ).catch(() => null)
        } catch (err) {
          console.error('[instore/chat] stream error', err)
          controller.enqueue(encoder.encode(sseLine({ type: 'error', message: 'stream_failed' })))
          controller.close()
          return
        }

        // ── POST-PROCESSING: cards, upsell, demand signal, conversation save ──
        try {
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

          // Upsell — top co-purchase companion of the first card
          let upsell: ProductCard | null = null
          if (mentioned.length > 0) {
            const seedId = mentioned[0].id
            try {
              const since = new Date(Date.now() - 90 * 86400_000).toISOString()
              const { data: salesWithSeed } = await supabaseAdmin.from('pos_sale_items')
                .select('sale_id, pos_sales!inner(business_id, created_at, status)')
                .eq('product_id', seedId)
                .eq('pos_sales.business_id', business_id)
                .neq('pos_sales.status', 'voided')
                .gte('pos_sales.created_at', since)
                .limit(200)
              const saleIds = (salesWithSeed ?? []).map((r: { sale_id: string }) => r.sale_id).filter(Boolean)
              if (saleIds.length > 0) {
                const { data: companions } = await supabaseAdmin.from('pos_sale_items')
                  .select('product_id, quantity')
                  .in('sale_id', saleIds)
                  .neq('product_id', seedId)
                  .limit(500)
                const counts: Record<string, number> = {}
                for (const r of (companions ?? []) as Array<{ product_id: string | null; quantity: number | null }>) {
                  if (!r.product_id) continue
                  counts[r.product_id] = (counts[r.product_id] ?? 0) + Number(r.quantity ?? 1)
                }
                const topId = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0]
                const topProduct = topId ? products.find(p => p.id === topId) : null
                if (topProduct && !mentioned.find(m => m.id === topProduct.id)) {
                  const qty = Number(topProduct.stock_quantity ?? 0)
                  const tracked = topProduct.track_stock !== false
                  if (!tracked || qty > 0) {
                    upsell = {
                      id: topProduct.id,
                      name: topProduct.name,
                      price: topProduct.price != null ? Number(topProduct.price) : null,
                      stock: qty,
                      image_url: topProduct.image_url,
                    }
                  }
                }
              }
            } catch { /* non-fatal */ }
          }

          const wantsRecipe = config?.recipe_suggestions !== false && /recipe|what (can|could) i (make|cook|do)|dinner ideas?|lunch ideas?|breakfast ideas?|cook(ing)? with/i.test(message)

          const suggestLoyalty = (config?.loyalty_enabled !== false)
            && !memberContext
            && !emailMatch
            && history.length >= 4
            && !/loyalty|points|stamps|sign[- ]?up|join/i.test(history.slice(-4).map(h => h.content).join(' '))

          // Demand signal extraction
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

          // Save / update conversation
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

          // Final metadata event — single connection, simpler client
          controller.enqueue(encoder.encode(sseLine({
            type: 'metadata',
            conversation_id: convId,
            product_cards: productCards,
            upsell,
            suggest_recipe: wantsRecipe,
            suggest_loyalty_signup: suggestLoyalty,
            visitor_id: visitor_id ?? null,
            full_reply: replyText,
          })))
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        } catch (err) {
          console.error('[instore/chat] post-processing error', err)
          controller.enqueue(encoder.encode(sseLine({ type: 'error', message: 'post_failed' })))
        }
        controller.close()
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (err) {
    console.error('[instore/chat] error', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
