export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 20

import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { guardOutput } from '@/lib/aria/ground-guard'

// TICKETS-REBUILD — real (small) design assistant for the ticket editor, replacing the old setTimeout fake.
// Returns a short styling suggestion. Any $/% figure it invents is stripped by guardOutput (no fabricated
// pricing claims); styling numbers like "28px" are not business figures and pass through.

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', user.id).maybeSingle()
  const bid = (active?.business_id as string | null) ?? null

  const body = await req.json().catch(() => ({})) as { prompt?: string; size?: string }
  const want = (body.prompt ?? '').slice(0, 300)
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ suggestion: '' }, { status: 503 })

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 })
    const res = await client.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 160, temperature: 0.6,
      system: 'You are a retail price-ticket design assistant. Give ONE concise styling tip (1–2 sentences) for a shelf/price ticket — layout, colour, contrast, font weight/size. No preamble. Do NOT invent any product price or discount.',
      messages: [{ role: 'user', content: `Ticket size: ${body.size ?? 'standard'}. Goal: ${want || 'maximum shelf impact'}.` }],
    })
    const raw = res.content.filter(b => b.type === 'text').map(b => (b as { type: 'text'; text: string }).text).join('').trim()
    const guarded = await guardOutput(raw, [], { mode: 'redact', businessId: bid ?? undefined, surface: 'tickets/ai-suggest' })
    return NextResponse.json({ suggestion: guarded.text })
  } catch (e) {
    console.error('[tickets/ai-suggest]', (e as Error).message)
    return NextResponse.json({ suggestion: '' }, { status: 502 })
  }
}

export const POST = withErrorCapture('tickets/ai-suggest', _POST)
