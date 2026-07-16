export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { supabaseAdmin } from '@/lib/supabase-admin'
import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'
import { trackAICall } from '@/lib/aria/ai-telemetry'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// CANON-RAIL-1 beachhead — business_id now resolved by withBusinessContext (the rail), replacing
// this file's own local getBid(). Same resolution order, plus resolveOwnerBusinessId()'s
// re-validation that the active business is still owned/active (see with-error-capture.ts).
async function _GET(_req: Request, _context: unknown, { businessId: bid }: BusinessContext) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const { data: bookings } = await supabaseAdmin
    .from('bookings')
    .select('booking_date,booking_time,status')
    .eq('business_id', bid)
    .gte('booking_date', thirtyDaysAgo)
    .neq('status', 'cancelled')

  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const counts: Record<string, number> = {}
  for (const b of bookings ?? []) {
    const dow = new Date(String(b.booking_date).slice(0, 10) + 'T12:00:00').getDay()
    const hour = b.booking_time ? parseInt(String(b.booking_time).split(':')[0]) : null
    if (hour !== null) {
      const key = `${DAYS[dow]} ${hour}:00`
      counts[key] = (counts[key] ?? 0) + 1
    }
  }

  const total = Object.values(counts).reduce((s, c) => s + c, 0)
  if (total < 3) return NextResponse.json({ insight: null })

  const sorted = Object.entries(counts).sort((a, b) => a[1] - b[1])
  const slow = sorted.slice(0, 3).map(([slot, cnt]) => `${slot} (${cnt})`)
  const busy = sorted.slice(-3).map(([slot, cnt]) => `${slot} (${cnt})`)

  const msg = await trackAICall(
    { route: 'aria/booking-insights', model: 'claude-haiku-4-5-20251001', businessId: bid, purpose: 'booking-insights' },
    () => anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: 'You are a booking revenue analyst. Give one concise, actionable revenue insight in 1-2 sentences. No markdown, no bullet points.',
      messages: [{
        role: 'user',
        content: `Slowest booking slots (last 30 days): ${slow.join(', ')}. Busiest slots: ${busy.join(', ')}. Give one revenue optimisation recommendation.`,
      }],
    })
  )

  const insight = msg.content[0].type === 'text' ? msg.content[0].text.trim() : null
  return NextResponse.json({ insight })
}

export const GET = withBusinessContext('aria/booking-insights', _GET)
