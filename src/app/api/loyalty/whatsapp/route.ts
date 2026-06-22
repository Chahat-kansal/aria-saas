export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { getLoyaltyMembership } from '@/lib/loyalty/auth'
import { getPreloadState, readPreloadConfig } from '@/lib/loyalty/preload'
import { whatsappConfigured, sendWhatsApp, waTemplates } from '@/lib/whatsapp'

// LOY-WHATSAPP — customer enrol/opt-out + balance check (identity-scoped) and owner enable (getBid).

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function balanceFor(businessId: string, customerId: string): Promise<{ points: number; dollar_value: number; preload: number | null }> {
  const { data: cust } = await supabaseAdmin.from('pos_customers').select('points_balance').eq('id', customerId).maybeSingle()
  const { data: cfg } = await supabaseAdmin.from('pos_loyalty_config').select('point_value_cents').eq('business_id', businessId).maybeSingle()
  const points = Number(cust?.points_balance ?? 0)
  const dollar = Math.round(points * Number(cfg?.point_value_cents ?? 1)) / 100
  const pre = await readPreloadConfig(businessId)
  const preload = pre.enabled ? (await getPreloadState(businessId, customerId)).balance : null
  return { points, dollar_value: dollar, preload }
}

async function _GET(req: Request) {
  const url = new URL(req.url)
  if (url.searchParams.get('owner') === '1') {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const bid = await getBid(supabase, user.id)
    if (!bid) return NextResponse.json({ enabled: false })
    const { data } = await supabaseAdmin.from('pos_loyalty_config').select('whatsapp_enabled').eq('business_id', bid).maybeSingle()
    return NextResponse.json({ enabled: !!data?.whatsapp_enabled, provider_configured: whatsappConfigured() })
  }

  const bidParam = url.searchParams.get('business_id')
  const realId = bidParam ? await resolveBusinessId(supabaseAdmin, bidParam) : null
  if (!realId) return NextResponse.json({ enabled: false })
  const { data: cfg } = await supabaseAdmin.from('pos_loyalty_config').select('whatsapp_enabled').eq('business_id', realId).maybeSingle()
  const m = await getLoyaltyMembership(realId)
  if (!cfg?.whatsapp_enabled || !m) return NextResponse.json({ enabled: !!cfg?.whatsapp_enabled, opted_in: false })
  const { data: cust } = await supabaseAdmin.from('pos_customers').select('whatsapp_consent').eq('id', m.customer_id).maybeSingle()
  return NextResponse.json({ enabled: true, opted_in: !!cust?.whatsapp_consent, has_phone: !!m.phone, balance: await balanceFor(realId, m.customer_id) })
}

async function _POST(req: Request) {
  const body = await req.json().catch(() => ({})) as { action?: string; business_id?: string; enabled?: boolean }

  // OWNER: enable/disable WhatsApp for the business.
  if (body.action === 'config') {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const bid = await getBid(supabase, user.id)
    if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })
    await supabaseAdmin.from('pos_loyalty_config').upsert({ business_id: bid, whatsapp_enabled: !!body.enabled, updated_at: new Date().toISOString() }, { onConflict: 'business_id' })
    return NextResponse.json({ ok: true, enabled: !!body.enabled })
  }

  // CUSTOMER: opt in / out (identity-scoped).
  const realId = body.business_id ? await resolveBusinessId(supabaseAdmin, String(body.business_id)) : null
  if (!realId) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const m = await getLoyaltyMembership(realId)
  if (!m) return NextResponse.json({ error: 'Sign in first' }, { status: 401 })

  if (body.action === 'opt_in') {
    await supabaseAdmin.from('pos_customers').update({ whatsapp_consent: true, whatsapp_opt_in_at: new Date().toISOString() }).eq('id', m.customer_id)
    // Send a welcome (flag-gated; only goes when a provider is configured + member has a phone).
    if (m.phone) {
      const { data: biz } = await supabaseAdmin.from('businesses').select('name').eq('id', realId).maybeSingle()
      await sendWhatsApp(m.phone, waTemplates.enrol((m.name ?? 'there').split(' ')[0], (biz?.name as string) ?? 'our'), { category: 'marketing', businessId: realId, customerId: m.customer_id, template: 'enrol' })
    }
    return NextResponse.json({ ok: true, opted_in: true })
  }
  if (body.action === 'opt_out') {
    await supabaseAdmin.from('pos_customers').update({ whatsapp_consent: false }).eq('id', m.customer_id)
    return NextResponse.json({ ok: true, opted_in: false })
  }
  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}

export const GET = withErrorCapture('loyalty/whatsapp:get', _GET)
export const POST = withErrorCapture('loyalty/whatsapp:post', _POST)
