export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { limit } from '@/lib/rate-limit'
import { requireTurnstile } from '@/lib/security/turnstile'

// SECURITY-P1 — login/signup/password-reset go straight from the browser to Supabase Auth's own
// REST endpoint (supabase.auth.signInWithPassword/signUp/resetPasswordForEmail) — there is no
// server route of ours in that call path to rate-limit or Turnstile-gate directly. This guard is
// called by the client BEFORE making that Supabase call; a 429/403 here stops the flow before it
// reaches Supabase. This raises the bar significantly against automated abuse of Aria's own login
// page (the overwhelming majority of real-world abuse), though it cannot stop a sufficiently
// sophisticated attacker who scripts a direct call to Supabase's public REST endpoint bypassing our
// UI entirely — Supabase's own platform-level rate limits are the backstop for that case. True
// server-side enforcement for the direct-Supabase-call path would need a Supabase Auth Hook
// (a dashboard/project config, not something this codebase can configure) — noted in
// SECURITY-P1-REPORT.md as a P2 follow-up.
const LIMITS: Record<string, { requests: number; window: string }> = {
  login: { requests: 10, window: '15 m' },
  signup: { requests: 5, window: '1 h' },
  reset: { requests: 5, window: '1 h' },
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as { action?: string; turnstile_token?: string }
  const action = body.action ?? ''
  const rateLimitSpec = LIMITS[action]
  if (!rateLimitSpec) return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  const ip = (req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown').split(',')[0].trim()

  const rl = await limit(`auth-guard:${action}:${ip}`, rateLimitSpec)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many attempts. Please wait before trying again.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    )
  }

  // Turnstile only on signup (per sprint scope — new-account creation is the highest-value bot
  // target here; login/reset are rate-limited but not Turnstile-gated).
  if (action === 'signup') {
    const turnstileDenied = await requireTurnstile(body.turnstile_token, ip)
    if (turnstileDenied) return turnstileDenied
  }

  return NextResponse.json({ ok: true })
}
