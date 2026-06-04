export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { waitUntil } from '@vercel/functions'
import { withErrorCapture } from '@/lib/api/with-error-capture'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _POST() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 404 })

  const { data: biz } = await supabaseAdmin.from('businesses').select('name,industry').eq('id', bid).maybeSingle()
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const { data: bookings } = await supabaseAdmin.from('bookings')
    .select('booking_date,booking_time,party_size,status')
    .eq('business_id', bid).gte('booking_date', thirtyDaysAgo)
    .order('booking_date', { ascending: false }).limit(100)

  if (!bookings?.length) return NextResponse.json({ insight: 'No booking history yet — insights will appear once you have some bookings.' })

  const total = bookings.length
  const noShows    = bookings.filter(b => (b as Record<string,unknown>).status === 'no_show').length
  const cancelled  = bookings.filter(b => (b as Record<string,unknown>).status === 'cancelled').length
  const byDay: Record<string, number> = {}
  for (const b of bookings) {
    const day = new Date((b as Record<string,unknown>).booking_date as string + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'long' })
    byDay[day] = (byDay[day] || 0) + 1
  }
  const busiest = Object.entries(byDay).sort((a, bv) => bv[1] - a[1])[0]?.[0] ?? 'unknown'
  const summary = `${total} bookings in 30 days. No-show rate: ${Math.round(noShows/total*100)}%. Cancellation rate: ${Math.round(cancelled/total*100)}%. Busiest day: ${busiest}.`

  const resp = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{ role: 'user', content: `You are Aria, advisor for ${(biz as Record<string,unknown> | null)?.name} (Australian ${(biz as Record<string,unknown> | null)?.industry}). Booking data: ${summary}\n\nGive 2-3 specific, actionable insights in bullet points. Focus on no-show reduction, busy period prep, or revenue opportunities. Australian tone, concise.` }],
  })
  const insight = ((resp.content[0] as { type: string; text: string }).text ?? '').trim()

  waitUntil((async () => { try { await supabaseAdmin.from('aria_ai_calls').insert({ business_id: bid, model: 'claude-haiku-4-5-20251001', prompt_summary: 'booking_analysis', response_summary: insight.slice(0, 200), tokens_used: resp.usage.input_tokens + resp.usage.output_tokens }) } catch {} })())
  waitUntil((async () => { try { await supabaseAdmin.from('aria_autopilot_actions').insert({ business_id: bid, category: 'sales', action_type: 'booking_insight', title: 'Booking analysis', summary: insight.slice(0, 200), confidence: 0.85, status: 'pending' }) } catch {} })())

  return NextResponse.json({ insight })
}

export const POST = withErrorCapture('bookings/aria-suggest', _POST)
