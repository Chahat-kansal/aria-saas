import { supabaseAdmin } from '@/lib/supabase-admin'
import crypto from 'crypto'

const COOKIE_NAME = 'cx_session'

function parseCookieValue(cookieHeader: string, name: string): string | null {
  const prefix = name + '='
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim()
    if (trimmed.startsWith(prefix)) {
      try { return decodeURIComponent(trimmed.slice(prefix.length)) } catch { return null }
    }
  }
  return null
}

export interface CxSessionResult {
  session_id: string
  identity_id: string
  phone: string | null
  email: string | null
  business_id: string
}

export async function getCxSession(req: Request, businessId: string): Promise<CxSessionResult | null> {
  const cookieHeader = req.headers.get('cookie') ?? ''
  const rawToken = parseCookieValue(cookieHeader, COOKIE_NAME)
  if (!rawToken) return null

  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')

  const { data, error } = await supabaseAdmin
    .from('cx_sessions')
    .select('id, loyalty_identity_id, business_id, expires_at, revoked_at, loyalty_identity(phone, email)')
    .eq('token_hash', tokenHash)
    .eq('business_id', businessId)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (error) { console.error('[getCxSession] query error:', error.message); return null }
  if (!data) return null

  const rawIdentity = data.loyalty_identity
  const identity = (Array.isArray(rawIdentity) ? (rawIdentity as Array<{ phone: string | null; email: string | null }>)[0] : rawIdentity as { phone: string | null; email: string | null } | null) ?? null
  return {
    session_id: data.id as string,
    identity_id: data.loyalty_identity_id as string,
    phone: identity?.phone ?? null,
    email: identity?.email ?? null,
    business_id: data.business_id as string,
  }
}

export function clearCxSessionCookie(): string {
  return COOKIE_NAME + '=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'
}