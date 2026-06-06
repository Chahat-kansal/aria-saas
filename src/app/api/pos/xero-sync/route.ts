export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { refreshXeroToken, getXeroTenants } from '@/lib/integrations/oauth-clients/xero'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  // Get sync date from body (default yesterday)
  const body = await req.json().catch(() => ({})) as { date?: string }
  const syncDate = body.date ?? new Date(Date.now() - 86400000).toISOString().split('T')[0]

  // Get Xero integration
  const { data: integration } = await supabaseAdmin
    .from('pos_oauth_integrations')
    .select('*')
    .eq('business_id', bid)
    .eq('integration_key', 'xero')
    .eq('status', 'active')
    .maybeSingle()

  if (!integration) return NextResponse.json({ error: 'Xero not connected. Connect via Setup → Integrations.' }, { status: 400 })

  // Refresh token if needed
  let accessToken = integration.access_token_encrypted as string
  try {
    const refreshed = await refreshXeroToken(integration.refresh_token_encrypted as string)
    accessToken = refreshed.access_token
    // Update stored token
    await supabaseAdmin.from('pos_oauth_integrations').update({
      access_token_encrypted: refreshed.access_token,
      refresh_token_encrypted: refreshed.refresh_token,
      token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
    }).eq('id', integration.id)
  } catch {
    return NextResponse.json({ error: 'Xero token expired. Please reconnect via Setup → Integrations.' }, { status: 401 })
  }

  // Get Xero tenant (organisation)
  let tenantId = integration.external_account_id as string | null
  if (!tenantId) {
    const tenants = await getXeroTenants(accessToken)
    tenantId = tenants[0]?.tenantId ?? null
    if (tenantId) await supabaseAdmin.from('pos_oauth_integrations').update({ external_account_id: tenantId }).eq('id', integration.id)
  }
  if (!tenantId) return NextResponse.json({ error: 'No Xero organisation found' }, { status: 400 })

  // Fetch day's sales
  const dayStart = `${syncDate}T00:00:00.000Z`
  const dayEnd   = `${syncDate}T23:59:59.999Z`

  const { data: sales } = await supabaseAdmin
    .from('pos_sales')
    .select('id, total_amount, tax_total, subtotal, payment_method, status')
    .eq('business_id', bid)
    .neq('status', 'voided')
    .gte('created_at', dayStart)
    .lte('created_at', dayEnd)

  if (!sales?.length) return NextResponse.json({ ok: true, synced: 0, message: 'No sales found for this date' })

  // Summarise
  const totalRevenue = sales.reduce((s, x) => s + Number(x.total_amount ?? 0), 0)
  const totalTax     = sales.reduce((s, x) => s + Number(x.tax_total ?? 0), 0)
  const totalEx      = totalRevenue - totalTax
  const byMethod: Record<string, number> = {}
  for (const s of sales) {
    const m = String(s.payment_method ?? 'other')
    byMethod[m] = (byMethod[m] ?? 0) + Number(s.total_amount ?? 0)
  }

  // Push to Xero as a manual journal entry (daily sales summary)
  const xeroDate = syncDate  // YYYY-MM-DD

  const journalLines = [
    // Debit accounts receivable / cash for total (by payment method)
    ...Object.entries(byMethod).map(([method, amount]) => ({
      LineAmount: amount,
      AccountCode: method === 'cash' ? '090' : '091',  // Cash / EFTPOS accounts
      Description: `${method.toUpperCase()} receipts — ${syncDate}`,
      TaxType: 'NONE',
    })),
    // Credit sales revenue (excl GST)
    {
      LineAmount: -totalEx,
      AccountCode: '200',  // Sales Revenue
      Description: `Daily sales revenue — ${syncDate} (${sales.length} transactions)`,
      TaxType: 'NONE',
    },
    // Credit GST collected
    ...(totalTax > 0 ? [{
      LineAmount: -totalTax,
      AccountCode: '820',  // GST Collected
      Description: `GST collected — ${syncDate}`,
      TaxType: 'NONE',
    }] : []),
  ]

  const journalPayload = {
    Date: xeroDate,
    Narration: `Aria POS — Daily Sales Summary ${syncDate} (${sales.length} sales, $${totalRevenue.toFixed(2)} total)`,
    JournalLines: journalLines,
  }

  const xeroRes = await fetch('https://api.xero.com/api.xro/2.0/ManualJournals', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Xero-tenant-id': tenantId,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ ManualJournals: [journalPayload] }),
  })

  const xeroData = await xeroRes.json() as { ManualJournals?: Array<{ ManualJournalID?: string }>; Status?: string; Message?: string }

  if (!xeroRes.ok || xeroData.Status === 'ERROR') {
    console.error('[xero-sync] Xero API error:', JSON.stringify(xeroData).slice(0, 500))
    return NextResponse.json({
      error: `Xero rejected the sync: ${xeroData.Message ?? JSON.stringify(xeroData).slice(0, 200)}`,
      hint: 'Check account codes 090 (Cash), 091 (EFTPOS), 200 (Sales), 820 (GST) exist in your Xero chart of accounts.'
    }, { status: 400 })
  }

  const journalId = xeroData.ManualJournals?.[0]?.ManualJournalID

  // Log sync
  await supabaseAdmin.from('pos_oauth_integrations').update({
    last_synced_at: new Date().toISOString(),
  }).eq('id', integration.id)

  return NextResponse.json({
    ok: true,
    synced: sales.length,
    total: totalRevenue,
    xero_journal_id: journalId,
    message: `Synced ${sales.length} sales ($${totalRevenue.toFixed(2)}) to Xero for ${syncDate}`,
  })
}

export const POST = withErrorCapture('pos/xero-sync', _POST)
