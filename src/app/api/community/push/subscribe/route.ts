export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { ensureCommunityMember } from '@/lib/community/session'
import { getPublicVapidKey } from '@/lib/community/push'

// GET — returns the public VAPID key so the client can subscribe.
export async function GET() {
  const key = getPublicVapidKey()
  if (!key) return NextResponse.json({ error: 'Push not configured' }, { status: 503 })
  return NextResponse.json({ public_key: key })
}

// POST — register a PushSubscription for the current anonymous community member.
// Body: { endpoint, keys: { p256dh, auth }, user_agent? }
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({})) as {
      endpoint?: string
      keys?: { p256dh?: string; auth?: string }
      user_agent?: string
    }
    if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
      return NextResponse.json({ error: 'endpoint and keys (p256dh, auth) required' }, { status: 400 })
    }

    // Create the anonymous member if not joined yet — opting into push is the
    // first "joining" action for many visitors.
    const member = await ensureCommunityMember()

    await supabaseAdmin.from('community_push_subscriptions').upsert({
      member_id: member.id,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      user_agent: body.user_agent?.toString().slice(0, 300) ?? null,
      last_seen_at: new Date().toISOString(),
    }, { onConflict: 'member_id,endpoint' })

    // Also flip the member-level push_enabled flag (Phase 1 column)
    await supabaseAdmin.from('community_members').update({ push_enabled: true }).eq('id', member.id)

    return NextResponse.json({ ok: true, member_id: member.id })
  } catch (err) {
    console.error('[community/push/subscribe]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
