export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/auth/cron'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendAlert } from '@/lib/monitoring/alert'

// MONITOR-1 — gives the ai-router failover teeth. The Anthropic-credits
// outage ran 2 WEEKS silent on the Gemini fallback: circuit-breaker.ts's
// aria_provider_incidents rows just accumulated (each console.warn/error
// only visible in Vercel logs) with nobody actually notified, because
// nothing ever checked "has this been open a suspiciously long time" — the
// circuit's own OPEN_SEC (120s) window only governs when it re-probes, not
// when a human should be told the fallback has been carrying load for days.
//
// Any unresolved (resolved_at IS NULL) incident whose started_at is 2+ days
// ago gets ONE high-severity alert (alerted_at marks it so a re-run of this
// check within the same still-open incident doesn't re-alert every time).

const TRIP_DAYS = 2

export async function GET(req: Request) {
  const denied = verifyCronAuth(req)
  if (denied) return denied

  const cutoff = new Date(Date.now() - TRIP_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const { data: staleIncidents, error } = await supabaseAdmin
    .from('aria_provider_incidents')
    .select('id, provider, started_at, fallback_provider_used, trigger_error, alerted_at')
    .is('resolved_at', null)
    .lte('started_at', cutoff)
    .is('alerted_at', null)
    .order('started_at', { ascending: true })

  if (error) {
    console.warn('[ai-failover-alert-check] query failed:', error.message)
    return NextResponse.json({ ok: false, error: error.message })
  }

  const incidents = staleIncidents ?? []
  let alerted = 0

  for (const incident of incidents) {
    const startedAt = incident.started_at as string
    const daysOpen = Math.floor((Date.now() - new Date(startedAt).getTime()) / (24 * 60 * 60 * 1000))
    const ok = await sendAlert({
      title: `AI provider "${incident.provider}" has been down for ${daysOpen}+ days`,
      summary: `Open since ${startedAt}, currently falling back to ${incident.fallback_provider_used ?? 'an alternate provider'}. This alert exists specifically because the last Anthropic-credits outage ran 2 weeks unnoticed on the Gemini fallback.`,
      severity: 'high',
      details: {
        provider: incident.provider,
        started_at: startedAt,
        days_open: daysOpen,
        fallback_provider_used: incident.fallback_provider_used,
        trigger_error: (incident.trigger_error as string | null)?.slice(0, 300),
      },
    })
    // Mark alerted regardless of send success — sendAlert already logs failures,
    // and retrying every dispatch run on a persistently-unreachable webhook/
    // email/SMS provider would just spam those channels' own error logs.
    await supabaseAdmin
      .from('aria_provider_incidents')
      .update({ alerted_at: new Date().toISOString() })
      .eq('id', incident.id)
    if (ok) alerted++
  }

  console.log(`[ai-failover-alert-check] ${incidents.length} stale incident(s) found, ${alerted} alerted`)
  return NextResponse.json({ ok: true, found: incidents.length, alerted })
}
