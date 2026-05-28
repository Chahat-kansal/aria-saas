import crypto from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

export const TOKEN_WINDOW_DAYS = 5
export const SESSION_MAX_AGE = 420 // 7 minutes, in seconds
export const TABLET_MAX_AGE = 30 * 24 * 60 * 60 // 30 days

export function genToken(): string {
  return crypto.randomBytes(24).toString('base64url').slice(0, 32)
}

// Newest still-valid token for a business; lazily creates one if none exists
// (so a freshly-enabled kiosk has a working QR before the first cron run).
export async function ensureActiveToken(db: SupabaseClient, businessId: string): Promise<string | null> {
  const nowIso = new Date().toISOString()
  const { data } = await db.from('instore_kiosk_tokens')
    .select('token, expires_at').eq('business_id', businessId).eq('active', true)
    .gt('expires_at', nowIso).order('generated_at', { ascending: false }).limit(1).maybeSingle()
  if (data?.token) return data.token as string

  const token = genToken()
  const expires_at = new Date(Date.now() + TOKEN_WINDOW_DAYS * 86400000).toISOString()
  const { error } = await db.from('instore_kiosk_tokens').insert({ business_id: businessId, token, expires_at })
  return error ? null : token
}

export async function validateToken(db: SupabaseClient, businessId: string, token: string): Promise<boolean> {
  if (!token) return false
  const { data } = await db.from('instore_kiosk_tokens')
    .select('id').eq('business_id', businessId).eq('token', token).eq('active', true)
    .gt('expires_at', new Date().toISOString()).maybeSingle()
  return !!data
}

// How many days until the business's newest token expires (for poster-reprint warnings).
export async function daysUntilExpiry(db: SupabaseClient, businessId: string): Promise<number | null> {
  const { data } = await db.from('instore_kiosk_tokens')
    .select('expires_at').eq('business_id', businessId).eq('active', true)
    .gt('expires_at', new Date().toISOString()).order('expires_at', { ascending: false }).limit(1).maybeSingle()
  if (!data?.expires_at) return null
  return Math.ceil((new Date(data.expires_at as string).getTime() - Date.now()) / 86400000)
}

// Daily rotation: deactivate expired tokens, mint a fresh 5-day token per enabled kiosk.
export async function rotateAll(db: SupabaseClient): Promise<{ created: number; deactivated: number }> {
  const nowIso = new Date().toISOString()
  const { data: expired } = await db.from('instore_kiosk_tokens')
    .update({ active: false }).eq('active', true).lte('expires_at', nowIso).select('id')

  const { data: configs } = await db.from('instore_kiosk_configs').select('business_id').eq('enabled', true)
  let created = 0
  for (const c of configs ?? []) {
    const token = genToken()
    const expires_at = new Date(Date.now() + TOKEN_WINDOW_DAYS * 86400000).toISOString()
    const { error } = await db.from('instore_kiosk_tokens').insert({ business_id: c.business_id, token, expires_at })
    if (!error) created++
  }
  return { created, deactivated: (expired ?? []).length }
}
