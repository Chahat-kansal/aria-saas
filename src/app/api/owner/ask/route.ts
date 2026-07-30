export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { verifyBusinessAccess } from '@/lib/auth/verify-business-access'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { POST as askAria } from '@/app/api/aria/ask/route'
import { deriveChatActions, buildSuggestedChips } from '@/lib/owner-app/chat'
import { buildManagerContext } from '@/lib/manager/voice'

// OWNER-APP PH-3 — the phone's Aria tab is a THIN owner-scoped adapter over the EXISTING Ask Aria
// brain (src/app/api/aria/ask/route.ts), never a second reasoning engine.
//
// GROUNDING (verified, stated plainly per the brief): grounding is genuinely on the SHARED route,
// not a web-only wrapper — validateAndHeal (GROUNDING-TEETH-V2's stripUngroundedNumbers) runs
// INSIDE that route's own _POST (its final step, plus the deliverable and council paths), and
// computeHealthSignals (HEALTH-SIGNALS-1) is invoked in the same handler. Because this route
// forwards to that handler in-process rather than reimplementing anything, phone answers inherit
// the exact same grounding as the web surface. No grounding code is duplicated here — that was the
// explicit failure mode to avoid.
//
// TENANT SAFETY: the brain resolves the business itself from the session (its own getBid(user)),
// deliberately ignoring any client-supplied id. The phone is slug-scoped, so this route verifies
// the caller genuinely owns the business_id the phone is displaying BEFORE forwarding, and the
// brain then independently resolves the same owner's business — two independent checks, no
// cross-tenant path, and no modification to the brain's own resolution.

// GET /api/owner/ask?business_id=X — suggested chips (real, answerable questions for THIS business)
async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const business_id = searchParams.get('business_id')
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const denied = await verifyBusinessAccess(user.id, business_id)
  if (denied) return denied

  return NextResponse.json({ chips: await buildSuggestedChips(supabase, business_id) })
}

// POST /api/owner/ask { business_id, message, messages?[] } → grounded answer + derived actions
async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as {
    business_id?: string
    message?: string
    messages?: Array<{ role: 'user' | 'assistant'; content: string }>
    conversation_id?: string
  }
  const { business_id, message } = body
  if (!business_id || !message?.trim()) {
    return NextResponse.json({ error: 'business_id and message are required' }, { status: 400 })
  }

  const denied = await verifyBusinessAccess(user.id, business_id)
  if (denied) return denied

  // Forward to the existing brain IN-PROCESS (same pattern the cron dispatchers use to call other
  // route handlers directly) — cookies/session flow through the reconstructed Request, so the brain
  // authenticates the same user and applies its own rate limiting, routing, and grounding.
  // MANAGER-AGENT-1 — the owner is talking to the STORE MANAGER, which speaks for the whole team.
  // Implemented as CONTEXT prepended to the existing brain's conversation, never a second brain:
  // the manager already holds what the team produced (manager_reviews / pending decisions /
  // autonomy_ledger), so handing the brain that real state is all the "voice" requires. Every line
  // of it is read from real rows — null when there is genuinely nothing to report, in which case
  // the brain answers exactly as it did before.
  const managerContext = await buildManagerContext(supabase, business_id)
  const priorTurns = body.messages ?? []
  const messagesWithVoice = managerContext
    ? [{ role: 'assistant' as const, content: managerContext }, ...priorTurns]
    : priorTurns

  const brainReq = new Request(new URL('/api/aria/ask', req.url).toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: req.headers.get('cookie') ?? '' },
    body: JSON.stringify({
      message: message.trim(),
      messages: messagesWithVoice,
      conversation_id: body.conversation_id ?? null,
    }),
  })

  const brainRes = await askAria(brainReq)
  const payload = await brainRes.json().catch(() => null) as Record<string, unknown> | null
  if (!brainRes.ok || !payload) {
    return NextResponse.json(
      { error: (payload?.error as string) ?? 'Aria could not answer right now.' },
      { status: brainRes.status || 500 },
    )
  }

  // Actions are DERIVED from the answer + REAL linked records only — never fabricated. See
  // deriveChatActions: an "open the decision" action is emitted only when a live waiting decision
  // genuinely matches the exchange, so a tapped action can never point at a record that isn't there.
  const actions = await deriveChatActions(supabase, business_id, message.trim(), String(payload.response ?? ''))

  return NextResponse.json({
    response: payload.response ?? '',
    conversation_id: payload.conversation_id ?? null,
    blocks: payload.blocks ?? undefined,
    healed: payload.healed ?? undefined,
    degraded_provider: payload.degraded_provider ?? undefined,
    actions,
  })
}

export const GET = withErrorCapture('owner/ask', _GET)
export const POST = withErrorCapture('owner/ask', _POST)
