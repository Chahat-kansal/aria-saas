export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendSMS } from '@/lib/clicksend'
import { hasValidKioskSession } from '@/lib/kiosk/cookie'
import { limit } from '@/lib/rate-limit'
import { withErrorCapture } from '@/lib/api/with-error-capture'

// KIOSK-INBOX-1 — "Talk to staff" (prompts/81-kiosk-improvements.md, Improvement 4). The
// dashboard/inbox read side for category='kiosk_help_request' (src/app/api/dashboard/inbox/
// route.ts + customer_interactions_v) has existed since 2026-05-28 with nothing ever writing to
// it — no kiosk UI button, no endpoint. This is that endpoint. Mirrors the existing owner-SMS-alert
// pattern in src/app/api/public/widget/chat/route.ts (booking alert): aria_autopilot_actions insert
// + sendSMS to the owner's phone.
type Msg = { role?: string; content?: string }

async function _POST(req: Request) {
  const { business_id, conversation_id } = await req.json().catch(() => ({})) as {
    business_id?: string
    conversation_id?: string
  }
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  if (!hasValidKioskSession(business_id)) {
    return NextResponse.json({ error: 'session_expired' }, { status: 401 })
  }

  // Rate-limit: no per-device identity exists at the kiosk (no auth, no cookie beyond the shared
  // kiosk session) — per-business+IP is the closest available proxy for "per device".
  const ip = (req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown').split(',')[0].trim()
  const rl = await limit('instore-help:' + business_id + ':' + ip, { requests: 1, window: '5 m' })
  if (!rl.ok) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } })
  }

  const [{ data: biz }, convRes] = await Promise.all([
    supabaseAdmin.from('businesses').select('name, phone, owner_phone').eq('id', business_id).maybeSingle(),
    conversation_id
      ? supabaseAdmin.from('instore_conversations').select('messages').eq('id', conversation_id).eq('business_id', business_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const lastMessages = ((convRes?.data?.messages as Msg[] | null) ?? []).slice(-2)
  const description = lastMessages.length > 0
    ? lastMessages.map(m => (m.role === 'user' ? 'Customer: ' : 'Aria: ') + (m.content ?? '')).join('\n').slice(0, 500)
    : 'Customer requested help at the kiosk (no conversation on file).'

  const { data: action } = await supabaseAdmin.from('aria_autopilot_actions').insert({
    business_id,
    category: 'kiosk_help_request',
    priority: 'important',
    title: 'Customer at kiosk needs help',
    description,
    action_data: { conversation_id: conversation_id ?? null },
    status: 'pending',
  }).select('id').single()

  const ownerPhone = biz?.owner_phone || biz?.phone
  if (ownerPhone) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.ariaos.site'
    const smsBody = 'Customer at the in-store kiosk needs help right now. View: ' + appUrl + '/dashboard/inbox'
    await sendSMS(ownerPhone, smsBody).catch(() => null)
  }

  return NextResponse.json({ ok: true, action_id: action?.id ?? null })
}

export const POST = withErrorCapture('public/instore/help', _POST)
