export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/auth/cron'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { refreshXeroToken } from '@/lib/integrations/oauth-clients/xero'

interface JournalLine {
  description: string
  amount: number
  account_code: string
  type: 'debit' | 'credit'
}

interface PreviewPayload {
  sales_count: number
  total_revenue: number
  total_tax: number
  total_ex_gst: number
  by_method: Record<string, number>
  journal_lines: JournalLine[]
}

async function pushManualJournal(
  accessToken: string,
  tenantId: string,
  date: string,
  lines: JournalLine[],
): Promise<string> {
  const journalLines = lines.map(l => ({
    LineAmount: l.type === 'debit' ? l.amount : -l.amount,
    AccountCode: l.account_code,
    Description: l.description,
    TaxType: 'NONE',
  }))

  const res = await fetch('https://api.xero.com/api.xro/2.0/ManualJournals', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + accessToken,
      'Xero-tenant-id': tenantId,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      ManualJournals: [{
        Date: date,
        Narration: 'Aria POS — Auto Daily Sales Summary ' + date,
        JournalLines: journalLines,
      }],
    }),
  })

  if (res.status === 401) throw new Error('XERO_401')
  if (!res.ok) {
    const body = await res.text()
    throw new Error('Xero POST ' + res.status + ': ' + body.slice(0, 200))
  }
  const json = await res.json() as { ManualJournals?: Array<{ ManualJournalID?: string }> }
  return json?.ManualJournals?.[0]?.ManualJournalID ?? ''
}

export async function GET(req: Request) {
  const denied = verifyCronAuth(req)
  if (denied) return denied
  const today = new Date().toISOString().split('T')[0]

  // Only process businesses with auto_sync enabled
  const { data: businesses } = await supabaseAdmin
    .from('businesses')
    .select('id, xero_access_token, xero_refresh_token, xero_tenant_id')
    .eq('xero_auto_sync', true)
    .not('xero_access_token', 'is', null)

  if (!businesses?.length) return NextResponse.json({ ok: true, processed: 0 })

  let synced = 0
  let skipped = 0
  const errors: string[] = []

  for (const biz of businesses) {
    try {
      // Skip if already synced today
      const { data: existing } = await supabaseAdmin
        .from('xero_sync_previews')
        .select('id, status')
        .eq('business_id', biz.id)
        .eq('date', today)
        .maybeSingle()

      if (existing?.status === 'synced') { skipped++; continue }

      // Build preview if not exists
      let previewId: string
      let lines: JournalLine[]

      if (existing?.status === 'pending') {
        const { data: p } = await supabaseAdmin
          .from('xero_sync_previews')
          .select('id, payload')
          .eq('id', existing.id)
          .single()
        previewId = p!.id
        lines = (p!.payload as PreviewPayload).journal_lines ?? []
      } else {
        // Prepare: fetch today's sales
        const dayStart = today + 'T00:00:00.000Z'
        const dayEnd   = today + 'T23:59:59.999Z'
        const { data: sales } = await supabaseAdmin
          .from('pos_sales')
          .select('total_amount, tax_total, payment_method')
          .eq('business_id', biz.id)
          .neq('status', 'voided')
          .gte('created_at', dayStart)
          .lte('created_at', dayEnd)

        if (!sales?.length) { skipped++; continue }

        const totalRevenue = sales.reduce((s, x) => s + Number(x.total_amount ?? 0), 0)
        const totalTax     = sales.reduce((s, x) => s + Number(x.tax_total ?? 0), 0)
        const totalEx      = +(totalRevenue - totalTax).toFixed(2)
        const byMethod: Record<string, number> = {}
        for (const s of sales) {
          const m = String(s.payment_method ?? 'other')
          byMethod[m] = +((byMethod[m] ?? 0) + Number(s.total_amount ?? 0)).toFixed(2)
        }

        lines = [
          ...Object.entries(byMethod).map(([method, amount]) => ({
            description: method.toUpperCase() + ' receipts — ' + today,
            amount: +amount.toFixed(2),
            account_code: method === 'cash' ? '090' : '091',
            type: 'debit' as const,
          })),
          {
            description: 'Daily sales revenue — ' + today + ' (' + sales.length + ' transactions)',
            amount: totalEx,
            account_code: '200',
            type: 'credit' as const,
          },
          ...(totalTax > 0 ? [{
            description: 'GST collected — ' + today,
            amount: +totalTax.toFixed(2),
            account_code: '820',
            type: 'credit' as const,
          }] : []),
        ]

        const payload: PreviewPayload = {
          sales_count: sales.length,
          total_revenue: +totalRevenue.toFixed(2),
          total_tax: +totalTax.toFixed(2),
          total_ex_gst: totalEx,
          by_method: byMethod,
          journal_lines: lines,
        }

        const { data: p } = await supabaseAdmin
          .from('xero_sync_previews')
          .insert({ business_id: biz.id, date: today, status: 'pending', payload })
          .select()
          .single()
        previewId = p!.id
      }

      // Push to Xero with token refresh on 401
      let accessToken = biz.xero_access_token as string
      const tenantId  = biz.xero_tenant_id as string
      if (!tenantId) { skipped++; continue }

      const attempt = () => pushManualJournal(accessToken, tenantId, today, lines)
      let journalId: string
      try {
        journalId = await attempt()
      } catch (e) {
        if ((e as Error).message === 'XERO_401') {
          const fresh = await refreshXeroToken(biz.xero_refresh_token as string)
          accessToken = fresh.access_token
          await supabaseAdmin.from('businesses').update({
            xero_access_token: fresh.access_token,
            xero_refresh_token: fresh.refresh_token,
            xero_token_expires_at: new Date(Date.now() + fresh.expires_in * 1000).toISOString(),
          }).eq('id', biz.id)
          journalId = await attempt()
        } else {
          throw e
        }
      }

      await supabaseAdmin.from('xero_sync_previews').update({
        status: 'synced',
        synced_at: new Date().toISOString(),
        xero_journal_id: journalId,
      }).eq('id', previewId)

      synced++
    } catch (e) {
      errors.push(biz.id + ': ' + (e as Error).message)
      await supabaseAdmin.from('xero_sync_previews').update({ status: 'failed' })
        .eq('business_id', biz.id).eq('date', today).eq('status', 'pending')
    }
  }

  return NextResponse.json({ ok: true, processed: businesses.length, synced, skipped, errors })
}
