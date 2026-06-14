export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/auth/cron'
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { trackAICall } from '@/lib/aria/ai-telemetry'

const DEAD = ['delivered', 'cancelled', 'returned', 'lost']
const BATCH = 40

interface Parcel {
  id: string; business_id: string; tracking_number: string | null; carrier_name: string | null; carrier: string | null
  status: string | null; status_detail: string | null; origin: string | null; destination: string | null
  estimated_delivery: string | null; last_event_at: string | null; created_at: string
}

function risk(p: Parcel): { late: boolean; reason: string } {
  const today = new Date().toISOString().slice(0, 10)
  if (p.estimated_delivery && p.estimated_delivery < today) {
    const days = Math.floor((Date.now() - new Date(p.estimated_delivery).getTime()) / 86400000)
    return { late: true, reason: `past its estimated delivery by ${days} day${days === 1 ? '' : 's'}` }
  }
  const lastEvent = p.last_event_at ? new Date(p.last_event_at).getTime() : new Date(p.created_at).getTime()
  const stuckDays = Math.floor((Date.now() - lastEvent) / 86400000)
  if (stuckDays >= 4) return { late: true, reason: `no tracking update for ${stuckDays} days` }
  return { late: false, reason: '' }
}

async function _GET(req: Request) {
  const denied = verifyCronAuth(req)
  if (denied) return denied

  // Active parcels only — never spend AI on delivered/cancelled.
  const { data: parcels } = await supabaseAdmin.from('pos_parcel_tracking')
    .select('id, business_id, tracking_number, carrier_name, carrier, status, status_detail, origin, destination, estimated_delivery, last_event_at, created_at')
    .not('status', 'in', `(${DEAD.join(',')})`)
    .order('estimated_delivery', { ascending: true })
    .limit(BATCH)

  const list = (parcels ?? []) as Parcel[]
  if (!list.length) return NextResponse.json({ ok: true, evaluated: 0 })

  const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null
  const now = new Date().toISOString()
  let aiCalls = 0

  for (const p of list) {
    const r = risk(p)
    let insight: string | null = null

    if (r.late && anthropic) {
      const carrier = p.carrier_name || p.carrier || 'the courier'
      try {
        const msg = await trackAICall(
          { route: 'cron/parcel-insights', model: 'claude-haiku-4-5-20251001', businessId: p.business_id, purpose: 'parcel-risk' },
          () => anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 120,
            messages: [{
              role: 'user',
              content: `A parcel is ${r.reason}. Carrier: ${carrier}. From ${p.origin ?? 'unknown'} to ${p.destination ?? 'unknown'}. Status: ${p.status ?? 'unknown'}${p.status_detail ? ' — ' + p.status_detail : ''}. In ONE practical sentence, advise an Australian small-business owner whether/when to chase the courier or sender. Be concrete. No preamble.`,
            }],
          })
        )
        insight = msg.content[0]?.type === 'text' ? msg.content[0].text.trim() : null
        aiCalls++
      } catch { /* skip one failure */ }
    }

    await supabaseAdmin.from('pos_parcel_tracking').update({
      predicted_late: r.late,
      aria_insight: r.late ? insight : null,
      aria_evaluated_at: now,
    }).eq('id', p.id)
  }

  return NextResponse.json({ ok: true, evaluated: list.length, ai_calls: aiCalls })
}

export const GET = withErrorCapture('cron/parcel-insights', _GET)
