import { createServerSupabaseClient } from '@/lib/supabase-server'

async function sendEmail(to: string[], subject: string, html: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY ?? ''
  if (!apiKey) return false
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        from: 'Aria OS <aria@ariaos.site>',
        to,
        subject,
        html,
      }),
    })
    if (!r.ok) {
      const err = await r.text()
      console.error('Resend error:', err)
    }
    return r.ok
  } catch {
    return false
  }
}

export async function sendDailySummaryReport(
  businessId: string,
  recipients: string[],
): Promise<boolean> {
  const supabase = createServerSupabaseClient()

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const yesterdayStart = new Date(Date.now() - 86400_000); yesterdayStart.setHours(0, 0, 0, 0)

  const [todayQ, yesterdayQ, lowStockQ, bizQ] = await Promise.all([
    supabase.from('pos_sales').select('total_amount')
      .eq('business_id', businessId)
      .gte('created_at', todayStart.toISOString()),
    supabase.from('pos_sales').select('total_amount')
      .eq('business_id', businessId)
      .gte('created_at', yesterdayStart.toISOString())
      .lt('created_at', todayStart.toISOString()),
    supabase.from('pos_outlet_inventory').select('items_on_hand,items_reorder_level,pos_products(name)')
      .eq('business_id', businessId)
      .lt('items_on_hand', 5)
      .limit(10),
    supabase.from('businesses').select('name').eq('id', businessId).maybeSingle(),
  ])

  const todayRevenue = (todayQ.data ?? []).reduce((s, x: Record<string,unknown>) => s + (Number(x.total_amount) || 0), 0)
  const yesterdayRevenue = (yesterdayQ.data ?? []).reduce((s, x: Record<string,unknown>) => s + (Number(x.total_amount) || 0), 0)
  const changeSign = todayRevenue >= yesterdayRevenue ? '+' : ''
  const changePct = yesterdayRevenue > 0
    ? ((todayRevenue - yesterdayRevenue) / yesterdayRevenue * 100).toFixed(1)
    : '0'
  const lowStock = lowStockQ.data ?? []
  const bizName = (bizQ.data as { name?: string } | null)?.name ?? 'Your Business'
  const dateStr = new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })
  const changeColor = todayRevenue >= yesterdayRevenue ? '#059669' : '#dc2626'

  const html = `<!DOCTYPE html><html><body style="font-family:sans-serif;color:#1a1a1a;max-width:600px;margin:0 auto;padding:24px;">
  <div style="margin-bottom:24px;">
    <h2 style="font-size:20px;font-weight:600;color:#2D5240;margin:0;">${bizName}</h2>
    <p style="color:#666;margin:4px 0 0;">Daily Summary — ${dateStr}</p>
  </div>
  <div style="background:#f9f9f7;border-radius:8px;padding:20px;margin-bottom:16px;">
    <div style="font-size:32px;font-weight:700;color:#2D5240;">$${todayRevenue.toFixed(2)}</div>
    <div style="color:#666;font-size:14px;">Today's revenue · ${(todayQ.data ?? []).length} transactions</div>
    <div style="font-size:14px;margin-top:8px;color:${changeColor};">${changeSign}${changePct}% vs yesterday ($${yesterdayRevenue.toFixed(2)})</div>
  </div>
  ${lowStock.length > 0 ? `
  <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:16px;margin-bottom:16px;">
    <h3 style="font-size:14px;font-weight:600;color:#c2410c;margin:0 0 8px;">⚠ Low Stock Alert</h3>
    ${(lowStock as Array<Record<string,unknown>>).map(p => `<div style="font-size:13px;padding:4px 0;border-bottom:1px solid #fed7aa;">${String((p.pos_products as Record<string,unknown> | null)?.name ?? '')} — ${Number(p.items_on_hand) || 0} remaining</div>`).join('')}
  </div>` : ''}
  <div style="text-align:center;margin-top:24px;">
    <a href="https://ariaos.site/dashboard" style="background:#2D5240;color:white;padding:10px 24px;border-radius:6px;text-decoration:none;font-size:14px;">Open Aria Dashboard →</a>
  </div>
  <p style="font-size:12px;color:#999;margin-top:24px;text-align:center;">Sent by Aria OS · <a href="https://ariaos.site/dashboard/ask-aria/intelligence" style="color:#999;">Manage reports</a></p>
</body></html>`

  return sendEmail(recipients, `${bizName} — Daily Summary ${dateStr}`, html)
}
