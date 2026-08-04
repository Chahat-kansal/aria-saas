import { supabaseAdmin } from '@/lib/supabase-admin'

// S-PROMO-RULE-1 — the weather signal a conditional promotion evaluates against.
//
// Stored in the EXISTING aria_signal_cache (no new table) and refreshed by the EXISTING daily
// briefings cron (no new route, no new Vercel function — the cron slots are full at 22).
//
// FAIL CLOSED IS THE WHOLE DESIGN. The evaluator reads the cache and nothing else: it never fetches
// in the cart path, and a missing or expired signal means a weather-triggered promotion does NOT
// apply. Discounting because a weather API was slow is money out of the owner's till for a
// condition nobody verified; refusing to discount is merely the promotion not firing.

export const WEATHER_SIGNAL_TYPE = 'weather_daily'

/** Cache key is per business per calendar day, so yesterday's reading can never satisfy today. */
export function weatherCacheKey(businessId: string, ymd: string): string {
  return businessId + ':' + ymd
}

export interface WeatherSignal {
  max_temp_c: number
  observed_at: string
  source: string
}

/**
 * Read the cached signal. Returns null when absent OR expired — callers must treat null as
 * "condition unproven", never as "condition met".
 */
export async function readWeatherSignal(businessId: string, ymd: string): Promise<WeatherSignal | null> {
  try {
    const { data } = await supabaseAdmin
      .from('aria_signal_cache')
      .select('payload, expires_at')
      .eq('signal_type', WEATHER_SIGNAL_TYPE)
      .eq('cache_key', weatherCacheKey(businessId, ymd))
      .maybeSingle()

    if (!data) return null
    // Expiry is enforced HERE as well as by any sweeper: a stale row left behind by a failed
    // cleanup must not silently authorise a discount.
    if (new Date(data.expires_at as string).getTime() <= Date.now()) return null

    const p = data.payload as Record<string, unknown> | null
    const t = Number(p?.max_temp_c)
    if (!p || !Number.isFinite(t)) return null
    return { max_temp_c: t, observed_at: String(p.observed_at ?? ''), source: String(p.source ?? '') }
  } catch (e) {
    console.error('[weather-signal] read failed (treated as no signal):', (e as Error).message)
    return null
  }
}

/**
 * Refresh today's signal for one business. Called from the existing daily cron.
 * Best-effort: a failure leaves the previous row alone and simply means triggers do not fire.
 */
export async function refreshWeatherSignal(
  businessId: string, lat: number, lng: number, ymd: string,
): Promise<number | null> {
  try {
    // forecast_days=1 -> index 0 is TODAY. The briefing's own call uses index [1] because it talks
    // about tomorrow; a promotion must evaluate against the day it is actually trading.
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lng
      + '&daily=temperature_2m_max&timezone=auto&forecast_days=1'
    const res = await fetch(url, { signal: AbortSignal.timeout(4_000) })
    if (!res.ok) return null

    const d = await res.json() as { daily?: { temperature_2m_max?: number[] } }
    const maxC = d.daily?.temperature_2m_max?.[0]
    if (maxC == null || !Number.isFinite(maxC)) return null

    const nowIso = new Date().toISOString()
    await supabaseAdmin.from('aria_signal_cache').upsert({
      business_id: businessId,
      signal_type: WEATHER_SIGNAL_TYPE,
      cache_key: weatherCacheKey(businessId, ymd),
      payload: { max_temp_c: maxC, observed_at: nowIso, source: 'open-meteo' },
      // +1h, per spec. Short on purpose: a promotion should stop firing within the hour if the
      // refresh stops working, rather than coasting on a reading nobody is maintaining.
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    }, { onConflict: 'cache_key' })

    return maxC
  } catch (e) {
    console.error('[weather-signal] refresh failed (non-fatal):', (e as Error).message)
    return null
  }
}
