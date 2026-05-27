export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

const DEFAULTS = [
  { trigger_type: 'lapsed_30', label: 'Lapsed 30 days', desc: 'Auto-send day 30 re-engagement', is_active: false, sms_message: "Hi {name}! We miss you — it's been 30 days since your last visit. Come back and we'll look after you.", email_subject: "We miss you — 30 days already!", email_body: "<p>Hi {name},</p><p>It's been 30 days since we last saw you and we miss you! We'd love to see you back soon.</p><p>See you soon,<br>The team</p>" },
  { trigger_type: 'lapsed_60', label: 'Lapsed 60 days', desc: 'Auto-send day 60 incentive', is_active: false, sms_message: "Hi {name}! It's been 2 months — enjoy 10% off your next visit, just for coming back.", email_subject: "It's been a while — 10% off for you", email_body: "<p>Hi {name},</p><p>Two months is too long! Enjoy 10% off your next visit as our thank-you for being such a valued customer.</p><p>See you soon,<br>The team</p>" },
  { trigger_type: 'lapsed_90', label: 'Lapsed 90 days', desc: 'Final attempt — 90 day win-back', is_active: false, sms_message: "Hi {name}! We haven't seen you in 3 months. Come back this week and get 15% off — just mention this message.", email_subject: "Last chance — 15% off this week only", email_body: "<p>Hi {name},</p><p>We haven't seen you in 90 days and we really miss you. This is our last outreach — enjoy 15% off this week only.</p><p>Hope to see you soon,<br>The team</p>" },
  { trigger_type: 'big_spender', label: 'Big spender gone quiet', desc: '$500+ lifetime spend, absent 45 days', is_active: false, sms_message: "Hi {name}! As one of our top customers, we want to make sure you're looked after. Come in this week for VIP treatment.", email_subject: "VIP message — we've missed you", email_body: "<p>Hi {name},</p><p>You're one of our most valued customers and we've noticed it's been a while. Come in and mention this message for VIP treatment on your next visit.</p><p>See you soon,<br>The team</p>" },
]

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const business_id = searchParams.get('business_id')
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: existing } = await supabaseAdmin.from('winback_automations').select('*').eq('business_id', business_id)

  const automations = DEFAULTS.map(def => {
    const found = (existing ?? []).find((e: { trigger_type: string }) => e.trigger_type === def.trigger_type)
    return found ? { ...def, ...found } : { ...def, id: null, business_id }
  })

  return NextResponse.json({ automations })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { business_id, trigger_type, is_active, sms_message, email_subject, email_body } = await req.json()
  if (!business_id || !trigger_type) return NextResponse.json({ error: 'business_id and trigger_type required' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: existing } = await supabaseAdmin.from('winback_automations').select('id').eq('business_id', business_id).eq('trigger_type', trigger_type).maybeSingle()

  if (existing?.id) {
    await supabaseAdmin.from('winback_automations').update({ is_active, sms_message, email_subject, email_body }).eq('id', existing.id)
  } else {
    await supabaseAdmin.from('winback_automations').insert({ business_id, trigger_type, is_active, sms_message, email_subject, email_body })
  }

  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('aria/winback-automations', _GET)
export const POST = withErrorCapture('aria/winback-automations', _POST)
