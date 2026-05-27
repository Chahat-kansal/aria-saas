import { createServerSupabaseClient } from '@/lib/supabase-server'
import { sendSMS } from '@/lib/clicksend'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function checkComplianceExpiry(businessId: string): Promise<number> {
  const now = new Date()
  let created = 0
  for (const days of [90, 60, 30]) {
    const target = new Date(now)
    target.setDate(target.getDate() + days)
    const dateStr = target.toISOString().slice(0, 10)
    const { data: expiring } = await supabaseAdmin
      .from('compliance_items')
      .select('id, title')
      .eq('business_id', businessId)
      .eq('reminder_enabled', true)
      .eq('expiry_date', dateStr)
      .neq('status', 'done')
    for (const item of expiring ?? []) {
      await supabaseAdmin.from('aria_actions').insert({
        business_id: businessId,
        category: 'compliance',
        title: `Compliance expiry: ${item.title}`,
        recommendation: `"${item.title}" expires in ${days} days. Renew now to stay compliant.`,
        expected_impact: '0.00',
        confidence: 'high',
        status: 'pending',
        source: 'aria_intelligence:compliance_expiry',
        priority: days <= 30 ? 'high' : 'medium',
        payload: { compliance_item_id: item.id, days_until_expiry: days },
      })
      created++
    }
  }
  return created
}

export interface AlertConditionConfig {
  type: 'stock_below' | 'revenue_below' | 'no_sales'
  product_id?: string
  product_name?: string
  category?: string
  threshold?: number
  period_hours?: number
}

export async function checkConditionAlerts(businessId: string): Promise<number> {
  const supabase = createServerSupabaseClient()
  let fired = 0

  const { data: alerts } = await supabase.from('aria_condition_alerts')
    .select('*').eq('business_id', businessId).eq('is_active', true)

  for (const alert of alerts ?? []) {
    const config = alert.condition_config as AlertConditionConfig
    let shouldFire = false
    let message = ''

    switch (config.type) {
      case 'stock_below': {
        let q = supabase.from('pos_products')
          .select('name,stock_quantity').eq('business_id', businessId).eq('is_active', true)
        if (config.product_id) q = q.eq('id', config.product_id)
        else if (config.product_name) q = q.ilike('name', `%${config.product_name}%`)
        else if (config.category) q = q.eq('category', config.category)
        const { data: prods } = await q.limit(20)
        const low = (prods ?? []).filter((p: Record<string,unknown>) =>
          (Number(p.stock_quantity) || 0) < (Number(config.threshold) || 10)
        )
        if (low.length > 0) {
          shouldFire = true
          message = `Stock alert: ${(low as Array<Record<string,unknown>>).map(p => `${String(p.name)} (${Number(p.stock_quantity) || 0} left)`).join(', ')}`
        }
        break
      }
      case 'revenue_below': {
        const hours = Number(config.period_hours) || 24
        const since = new Date(Date.now() - hours * 3600_000).toISOString()
        const { data: sales } = await supabase.from('pos_sales')
          .select('total_price').eq('business_id', businessId).gte('created_at', since)
        const revenue = (sales ?? []).reduce((s, x: Record<string,unknown>) => s + (Number(x.total_price) || 0), 0)
        if (revenue < (Number(config.threshold) || 0)) {
          shouldFire = true
          message = `Revenue alert: only $${revenue.toFixed(2)} in last ${hours}h (target: $${(Number(config.threshold) || 0).toFixed(2)})`
        }
        break
      }
      case 'no_sales': {
        const hours = Number(config.period_hours) || 4
        const since = new Date(Date.now() - hours * 3600_000).toISOString()
        const { count } = await supabase.from('pos_sales')
          .select('id', { count: 'exact', head: true })
          .eq('business_id', businessId).gte('created_at', since)
        if ((count ?? 0) === 0) {
          shouldFire = true
          message = `No sales in the last ${hours} hours — is the POS running?`
        }
        break
      }
    }

    if (!shouldFire) continue

    // Debounce: don't re-fire within 4 hours
    const lastFired = alert.last_triggered_at ? new Date(String(alert.last_triggered_at)).getTime() : 0
    if (Date.now() - lastFired < 4 * 3600_000) continue

    await supabaseAdmin.from('aria_actions').insert({
      business_id: businessId,
      category: 'sales',
      title: String(alert.name),
      recommendation: message,
      expected_impact: '0.00',
      confidence: 'high',
      status: 'pending',
      source: 'aria_intelligence:alert',
      priority: 'high',
      payload: { alert_id: alert.id, condition_type: config.type, message },
    })

    await supabaseAdmin.from('aria_condition_alerts').update({
      last_triggered_at: new Date().toISOString(),
      trigger_count: (Number(alert.trigger_count) || 0) + 1,
    }).eq('id', String(alert.id))

    // Send SMS via Twilio if owner has phone + alerts enabled
    try {
      const { data: biz } = await supabaseAdmin.from('businesses')
        .select('phone,owner_phone,alert_sms_enabled,name').eq('id', businessId).maybeSingle()
      const phone = biz?.owner_phone ?? biz?.phone
        if (phone && biz?.alert_sms_enabled) {
        // Replaced by ClickSend
        const twilioAuth = process.env.TWILIO_AUTH_TOKEN
        const twilioFrom = process.env.TWILIO_PHONE_NUMBER
        if (twilioSid && twilioAuth && twilioFrom) {
          const body = `Aria alert for ${biz.name}: ${message}`
            const to = phone as string
          const auth = Buffer.from(`${twilioSid}:${twilioAuth}`).toString('base64')
          await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
            method: 'POST',
            headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ To: to, From: twilioFrom, Body: body }).toString(),
          })
        }
      }
    } catch { /* SMS failure is non-fatal */ }

    fired++
  }
  return fired
}
