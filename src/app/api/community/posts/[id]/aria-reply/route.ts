export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { callAnthropic } from '@/lib/aria/providers/anthropic'
import { rateLimit, tooManyRequests, clientIp } from '@/lib/security/rate-limit'

// CX-1-P3 — explicit-trigger "Ask Aria about this post". PUBLIC + rate-limited. GROUNDING-TEETH:
// Aria answers ONLY from the post body + the business's PUBLIC profile fields (no owner-private data,
// no POS internals); if the facts don't answer the question it says it doesn't have that info.
const FALLBACK = 'I don\'t have that info — contact the business directly.'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    // SEC-H1 style: 5/min per IP, fail-open (a public convenience endpoint, not auth).
    const rl = await rateLimit(`community:aria:${clientIp(req)}`, 5, 60)
    if (!rl.allowed) return tooManyRequests(rl.retryAfter)

    const body = await req.json().catch(() => ({})) as { question?: string }
    const question = (body.question ?? '').toString().trim().slice(0, 300)
    if (!question) return NextResponse.json({ error: 'question required' }, { status: 400 })

    const { data: post } = await supabaseAdmin.from('community_posts')
      .select('id, business_id, title, body, post_type, businesses(name, industry, suburb, city, community_bio, google_rating, community_verified)')
      .eq('id', id).eq('status', 'published').maybeSingle()
    if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })

    const pr = post as Record<string, unknown>
    const biz = (pr.businesses ?? {}) as Record<string, unknown>
    // ONLY public, customer-visible facts — never owner-private or POS data.
    const facts = {
      business_name: biz.name ?? null,
      industry: biz.industry ?? null,
      location: [biz.suburb, biz.city].filter(Boolean).join(', ') || null,
      about: biz.community_bio ?? null,
      google_rating: biz.google_rating ?? null,
      verified_local_business: !!biz.community_verified,
      post_title: pr.title ?? null,
      post_content: pr.body ?? null,
    }

    const { data } = await callAnthropic<{ reply: string }>(
      {
        model: 'haiku', agentKey: 'generic', role: 'chat', maxTokens: 160, timeoutMs: 12000,
        businessId: String(pr.business_id),
        systemPrompt:
          'You are Aria, a friendly local-business assistant inside a community app. Answer the customer\'s ' +
          'question about THIS business using ONLY the facts in the user message. NEVER invent hours, prices, ' +
          'menu items, stock, contact details, or any fact not present. If the facts do not answer the question, ' +
          `reply EXACTLY: "${FALLBACK}". Keep it under 60 words, warm and concise. Return JSON {"reply":"..."}.`,
        userPrompt: JSON.stringify({ question, facts }),
      },
      { reply: FALLBACK },
    )

    const reply = (data.reply ?? '').toString().trim().slice(0, 400) || FALLBACK
    return NextResponse.json({ reply })
  } catch (err) {
    console.error('[community/aria-reply]', err)
    return NextResponse.json({ reply: FALLBACK })
  }
}
