import { supabaseAdmin } from '@/lib/supabase-admin'
import { computeAllSignalsForBusiness } from './signal-engine'
import { persistSignals } from './signal-store'
import { synthesizeFromSignals } from './anomaly-synth'

export async function runSignalsForBusiness(businessId: string): Promise<{ signal_count: number; alert_count: number }> {
  const signals = await computeAllSignalsForBusiness(businessId)
  await persistSignals(businessId, signals)

  const alerts = signals.filter(s => s.severity === 'alert' || s.severity === 'critical')
  if (alerts.length) {
    // Dedup: skip synthesis if same signal_types already fired in last 6 hours
    const sixHoursAgo = new Date(Date.now() - 6 * 3600 * 1000).toISOString()
    const { data: recentActions } = await supabaseAdmin
      .from('aria_actions')
      .select('payload')
      .eq('business_id', businessId)
      .eq('source', 'signal_engine')
      .gte('created_at', sixHoursAgo)

    const firedTypes = new Set<string>()
    for (const a of recentActions ?? []) {
      const triggering = (a.payload as Record<string, unknown>)?.triggering_signals
      if (Array.isArray(triggering)) triggering.forEach(t => firedTypes.add(String(t)))
    }

    const newAlerts = alerts.filter(a => !firedTypes.has(a.signal_type))
    if (newAlerts.length) await synthesizeFromSignals(businessId, newAlerts)
  }

  return { signal_count: signals.length, alert_count: alerts.length }
}
