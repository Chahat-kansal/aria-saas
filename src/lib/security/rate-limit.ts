// SEC-H1 — reusable serverless-safe rate limiter backed by the atomic Supabase rate_limit_hit() RPC.
// (The existing @upstash/ratelimit helper in @/lib/rate-limit fails OPEN when Upstash isn't configured,
// so this Supabase-backed limiter is the always-on baseline for auth/abuse routes.)
//
// fail-OPEN by default (a limiter-store hiccup must not take down the app); pass { failClosed: true }
// for auth/OTP/PIN where security outranks availability.
import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'

export interface RateLimitResult {
  allowed: boolean
  retryAfter: number // seconds until the current window resets
  remaining: number
}

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for') ?? ''
  const first = xff.split(',')[0]?.trim()
  return first || req.headers.get('x-real-ip') || 'unknown'
}

export async function rateLimit(
  key: string,
  limit: number,
  windowSec: number,
  opts: { failClosed?: boolean } = {},
): Promise<RateLimitResult> {
  try {
    const { data, error } = await supabaseAdmin.rpc('rate_limit_hit', {
      p_key: key,
      p_limit: limit,
      p_window_sec: windowSec,
    })
    const row = Array.isArray(data) ? data[0] : data
    if (error || !row) throw error ?? new Error('rate_limit_hit: no result')
    return {
      allowed: !!row.allowed,
      retryAfter: Number(row.retry_after) || 0,
      remaining: Math.max(0, limit - (Number(row.current_count) || 0)),
    }
  } catch (e) {
    console.error('[rate-limit] store error:', e instanceof Error ? e.message : String(e))
    return opts.failClosed
      ? { allowed: false, retryAfter: windowSec, remaining: 0 }
      : { allowed: true, retryAfter: 0, remaining: 0 }
  }
}

/** Generic 429 — message is intentionally non-specific (no account-existence leak). */
export function tooManyRequests(retryAfter: number): NextResponse {
  return NextResponse.json(
    { error: 'Too many requests. Please slow down and try again shortly.' },
    { status: 429, headers: { 'Retry-After': String(Math.max(1, retryAfter)) } },
  )
}
