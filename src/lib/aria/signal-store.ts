import { supabaseAdmin } from '@/lib/supabase-admin'
import type { Signal } from './signal-engine'

export async function persistSignals(businessId: string, signals: Signal[]): Promise<void> {
  if (!signals.length) return
  const now = new Date()
  const rows = signals.map(s => ({
    business_id: businessId,
    cache_key: `${businessId}:${s.signal_type}`,
    signal_type: s.signal_type,
    payload: { ...s.payload, severity: s.severity },
    expires_at: new Date(now.getTime() + s.expires_in_min * 60 * 1000).toISOString(),
  }))
  // cache_key has UNIQUE constraint — upsert is safe
  await supabaseAdmin.from('aria_signal_cache').upsert(rows, { onConflict: 'cache_key' })
}
