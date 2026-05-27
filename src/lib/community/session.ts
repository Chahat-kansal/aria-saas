import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { randomBytes, createHash } from 'crypto'

export const COMMUNITY_COOKIE = 'aria_community_session'
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365 * 2 // 2 years

export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashIp(ip: string | null): string | null {
  if (!ip) return null
  return createHash('sha256').update(ip).digest('hex').slice(0, 24)
}

export interface CommunityMember {
  id: string
  session_token: string
  nickname: string | null
  push_token: string | null
  push_enabled: boolean | null
  joined_at: string
}

/**
 * Resolve the current anonymous community member from the session cookie.
 * Returns null if no session — does NOT create one (caller decides).
 */
export async function getCommunityMember(): Promise<CommunityMember | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COMMUNITY_COOKIE)?.value
  if (!token) return null
  const { data } = await supabaseAdmin
    .from('community_members')
    .select('id, session_token, nickname, push_token, push_enabled, joined_at')
    .eq('session_token', token)
    .maybeSingle()
  return (data as CommunityMember | null) ?? null
}

/**
 * Create a brand-new anonymous member, set the cookie. No personal data collected.
 */
export async function createCommunityMember(nickname?: string | null): Promise<CommunityMember> {
  const token = generateSessionToken()
  const { data, error } = await supabaseAdmin.from('community_members').insert({
    session_token: token,
    nickname: nickname?.trim() ? nickname.trim().slice(0, 40) : null,
  }).select('id, session_token, nickname, push_token, push_enabled, joined_at').single()
  if (error || !data) throw new Error('Could not create community member')

  const cookieStore = await cookies()
  cookieStore.set({
    name: COMMUNITY_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: COOKIE_MAX_AGE_SECONDS,
  })

  return data as CommunityMember
}

/**
 * Get current member, or create one if absent. Used for explicit consent actions
 * (like following a business) where we need a stable identity for the consent record.
 */
export async function ensureCommunityMember(nickname?: string | null): Promise<CommunityMember> {
  const existing = await getCommunityMember()
  if (existing) return existing
  return createCommunityMember(nickname)
}

/**
 * Forget the current member (logout/leave the network). Marks the cookie cleared.
 */
export async function leaveCommunity() {
  const cookieStore = await cookies()
  cookieStore.set({ name: COMMUNITY_COOKIE, value: '', maxAge: 0, path: '/' })
}
