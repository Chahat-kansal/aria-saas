export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { sendSMS } from '@/lib/clicksend'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import Anthropic from '@anthropic-ai/sdk'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ campaigns: [] })
  const { data } = await supabase.from('pos_marketing_campaigns').select('*').eq('business_id', bid).order('created_at', { ascending: false })
  return NextResponse.json({ campaigns: data ?? [] })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json() as { action?: string; campaign_type?: string; channel?: string; name?: string; message_template?: string; campaign_id?: string; customer_ids?: string[]; discount_pct?: number }

  if (body.action === 'generate_message') {
    const { data: biz } = await supabaseAdmin.from('businesses').select('name,industry').eq('id', bid).maybeSingle()
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 200,
      system: 'Write a short friendly marketing SMS for an Australian small business. Max 160 chars. Include "Reply STOP to opt out." Return ONLY the message.',
      messages: [{ role: 'user', content: 'Campaign: ' + (body.campaign_type ?? 'winback') + ', Business: ' + (biz?.name ?? '') + ' (' + (biz?.industry ?? '') + '), Discount: ' + (body.discount_pct ?? 0) + '%' }],
    })
    const text = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
    return NextResponse.json({ message: text })
  }

  if (body.action === 'send_campaign') {
    if (!body.campaign_id) return NextResponse.json({ error: 'campaign_id required' }, { status: 400 })
    const { data: campaign } = await supabaseAdmin.from('pos_marketing_campaigns').select('*').eq('id', body.campaign_id).eq('business_id', bid).maybeSingle()
    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

    let customers: Array<{ id: string; name: string; phone: string | null; email: string | null }> = []
    if (body.customer_ids?.length) {
      const { data } = await supabaseAdmin.from('pos_customers').select('id,name,phone,email').in('id', body.customer_ids).eq('business_id', bid)
      customers = data ?? []
    } else {
      const ninetyDaysAgo = new Date(Date.now() - 90 * 86400_000).toISOString()
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000).toISOString()
      let q = supabaseAdmin.from('pos_customers').select('id,name,phone,email').eq('business_id', bid)
      if ((campaign as any).campaign_type === 'winback') q = q.lt('last_visit', ninetyDaysAgo)
      else if ((campaign as any).campaign_type === 'new_customer') q = q.gte('created_at', thirtyDaysAgo)
      const { data } = await q.limit(200)
      customers = (data ?? []).filter((c: any) => c.phone || c.email)
    }

    let sentCount = 0
    for (const c of customers) {
      if ((campaign as any).channel !== 'email' && c.phone) {
        try {
          const msgText = ((campaign as any).message_template ?? '').replace('{name}', c.name.split(' ')[0])
          const smsResult = await sendSMS(c.phone, msgText, { category: 'marketing', businessId: bid, customerId: c.id })
          if (smsResult.ok) sentCount++
          await supabaseAdmin.from('pos_campaign_sends').insert({ campaign_id: body.campaign_id, business_id: bid, customer_id: c.id, customer_name: c.name, customer_phone: c.phone, message_sent: msgText, channel: 'sms', send_status: smsResult.ok ? 'sent' : 'failed', sent_at: smsResult.ok ? new Date().toISOString() : null })
        } catch (e) { console.error('[non-fatal]', e) }
      }
    }
    await supabaseAdmin.from('pos_marketing_campaigns').update({ sent_count: (campaign as any).sent_count + sentCount, last_run_at: new Date().toISOString() }).eq('id', body.campaign_id)
    return NextResponse.json({ ok: true, sent_count: sentCount, total_customers: customers.length })
  }

  // Default: create campaign
  const { data: campaign, error } = await supabaseAdmin.from('pos_marketing_campaigns').insert({
    business_id: bid, name: body.name ?? ((body.campaign_type ?? 'manual') + ' campaign'),
    campaign_type: body.campaign_type ?? 'manual', channel: body.channel ?? 'sms',
    message_template: body.message_template ?? '', discount_pct: body.discount_pct ?? null,
    is_active: true, is_automated: false,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ campaign, ok: true }, { status: 201 })
}

export const GET = withErrorCapture('aria/marketing-campaigns', _GET)
export const POST = withErrorCapture('aria/marketing-campaigns', _POST)
