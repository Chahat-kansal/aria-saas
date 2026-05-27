export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { sendSMS } from '@/lib/clicksend'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '')
}

async function _POST(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: campaign } = await supabaseAdmin.from('campaigns').select('*').eq('id', params.id).maybeSingle()
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: biz } = await supabaseAdmin.from('businesses').select('*').eq('id', (campaign as Record<string,unknown>).business_id as string).maybeSingle()
  if (!biz || (biz as Record<string,unknown>).user_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const c = campaign as Record<string, unknown>
  const b = biz as Record<string, unknown>

  let customerQuery = supabaseAdmin
    .from('pos_customers')
    .select('id,name,email,phone,segment,days_since_visit,birthday,total_spend,visit_count,marketing_consent,tags')
    .eq('business_id', c.business_id as string)
    .eq('marketing_consent', true)

  if (c.target_type === 'segment' && c.target_segment) {
    customerQuery = (customerQuery as typeof customerQuery).eq('segment', c.target_segment as string)
  } else if (c.target_type === 'tag' && c.target_tag) {
    customerQuery = (customerQuery as typeof customerQuery).contains('tags', [c.target_tag as string])
  }

  const { data: customers } = await customerQuery.limit(500)
  if (!customers?.length) return NextResponse.json({ error: 'No eligible customers found', sent: 0 })
  const twilioToken = process.env.TWILIO_AUTH_TOKEN
  const smsEnabled  = !!(twilioSid && twilioToken && twilioFrom)

  let sent = 0, failed = 0, noPhone = 0

  await supabaseAdmin.from('campaigns').update({
    status: 'sending',
    sent_at: new Date().toISOString(),
    recipients_count: customers.length,
  }).eq('id', params.id)

  for (const customer of customers) {
    const cu = customer as Record<string, unknown>
    const firstName = ((cu.name as string) ?? '').split(' ')[0]
    const vars: Record<string, string> = {
      first_name: firstName,
      business_name: (b.name as string) ?? '',
      days_since_visit: String(cu.days_since_visit ?? ''),
      total_spend: `$${Number(cu.total_spend ?? 0).toFixed(2)}`,
      visit_count: String(cu.visit_count ?? 0),
      google_url: (b.google_business_url as string) ?? '',
      offer: '$10 off',
    }

    const messageText = interpolate((c.message as string) ?? '', vars)

    const { data: recipientRow } = await supabaseAdmin.from('campaign_recipients').upsert({
      campaign_id: params.id,
      customer_id: cu.id as string,
      business_id: c.business_id as string,
      channel: (c.channel as string) ?? 'sms',
      status: 'pending',
    }, { onConflict: 'campaign_id,customer_id' }).select('id').maybeSingle()

    if (c.channel === 'sms' || c.channel === 'both') {
      if (!cu.phone) {
        noPhone++
        if (recipientRow) await supabaseAdmin.from('campaign_recipients').update({ status: 'failed', error_message: 'no_phone' }).eq('id', (recipientRow as Record<string,unknown>).id as string)
        continue
      }
      if (!smsEnabled) {
        if (recipientRow) await supabaseAdmin.from('campaign_recipients').update({ status: 'failed', error_message: 'twilio_not_configured' }).eq('id', (recipientRow as Record<string,unknown>).id as string)
        failed++
        continue
      }
      try {
        await sendSMS(cu.phone as string, messageText)
          method: 'POST',
          headers: {
            'Authorization': `Basic ${Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ To: cu.phone as string, From: twilioFrom!, Body: messageText }),
        })
        const smsData = await res.json() as { sid?: string; error_message?: string }
        const rId = (recipientRow as Record<string,unknown>)?.id as string
        if (smsData.sid) {
          if (rId) await supabaseAdmin.from('campaign_recipients').update({ status: 'sent', sent_at: new Date().toISOString(), twilio_sid: smsData.sid }).eq('id', rId)
          sent++
        } else {
          if (rId) await supabaseAdmin.from('campaign_recipients').update({ status: 'failed', error_message: smsData.error_message ?? 'twilio_error' }).eq('id', rId)
          failed++
        }
      } catch (e) {
        const rId = (recipientRow as Record<string,unknown>)?.id as string
        if (rId) await supabaseAdmin.from('campaign_recipients').update({ status: 'failed', error_message: (e as Error).message.slice(0, 200) }).eq('id', rId)
        failed++
      }
      await new Promise(r => setTimeout(r, 100))
    }
  }

  await supabaseAdmin.from('campaigns').update({
    status: 'completed',
    sent_at_final: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    sent_count: sent,
    failed_count: failed,
  }).eq('id', params.id)

  return NextResponse.json({ ok: true, sent, failed, no_phone: noPhone, total: customers.length })
}

export const POST = withErrorCapture('marketing/campaigns/send', _POST)
