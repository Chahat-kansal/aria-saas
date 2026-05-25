export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

const CRON_SECRET = process.env.CRON_SECRET ?? ''

interface PosSaleRow {
  total_amount: number
  category_name: string | null
  payment_method: string | null
}

interface XeroTokens {
  access_token: string
  refresh_token: string
  expires_in: number
}

async function refreshXero(refresh_token: string): Promise<XeroTokens> {
  const credentials = Buffer.from(
    `${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`
  ).toString('base64')
  const res = await fetch('https://identity.xero.com/connect/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token }),
  })
  if (!res.ok) throw new Error('Xero token refresh failed')
  return res.json()
}

async function pushToXero(
  tenantId: string,
  accessToken: string,
  date: string,
  lineItems: Array<{ description: string; unitAmount: string; quantity: number }>
): Promise<void> {
  const invoice = {
    Type: 'ACCREC',
    Contact: { Name: 'POS Sales' },
    Date: date,
    DueDate: date,
    LineItems: lineItems.map(li => ({
      Description: li.description,
      Quantity: li.quantity,
      UnitAmount: li.unitAmount,
      AccountCode: '200',
    })),
    Status: 'AUTHORISED',
  }

  const res = await fetch('https://api.xero.com/api.xro/2.0/Invoices', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Xero-Tenant-Id': tenantId,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ Invoices: [invoice] }),
  })

  if (res.status === 401) throw new Error('XERO_401')
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Xero invoice POST ${res.status}: ${body.slice(0, 200)}`)
  }
}

export async function GET(req: Request) {
  const secret = req.headers.get('x-vercel-cron-signature')
    ?? req.headers.get('authorization')?.replace('Bearer ', '')
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const dateStr = yesterday.toISOString().slice(0, 10)
  const dayStart = `${dateStr}T00:00:00.000Z`
  const dayEnd = `${dateStr}T23:59:59.999Z`

  const { data: businesses } = await supabaseAdmin
    .from('businesses')
    .select('id, xero_access_token, xero_refresh_token, xero_tenant_id')
    .not('xero_access_token', 'is', null)
    .not('xero_tenant_id', 'is', null)

  if (!businesses || businesses.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 })
  }

  let processed = 0
  let errors = 0

  for (const biz of businesses) {
    try {
      const { data: sales } = await supabaseAdmin
        .from('pos_sales')
        .select('total_amount, category_name, payment_method')
        .eq('business_id', biz.id)
        .gte('created_at', dayStart)
        .lte('created_at', dayEnd)

      if (!sales || sales.length === 0) continue

      const byCategory = new Map<string, number>()
      for (const sale of sales as PosSaleRow[]) {
        const cat = sale.category_name ?? 'Uncategorised'
        byCategory.set(cat, (byCategory.get(cat) ?? 0) + (Number(sale.total_amount) || 0))
      }

      const lineItems = Array.from(byCategory.entries()).map(([cat, total]) => ({
        description: `${cat} — ${dateStr}`,
        unitAmount: (Number(total) || 0).toFixed(2),
        quantity: 1,
      }))

      let token = biz.xero_access_token as string
      try {
        await pushToXero(biz.xero_tenant_id as string, token, dateStr, lineItems)
      } catch (e) {
        if ((e as Error).message === 'XERO_401') {
          const fresh = await refreshXero(biz.xero_refresh_token as string)
          token = fresh.access_token
          await supabaseAdmin
            .from('businesses')
            .update({
              xero_access_token: fresh.access_token,
              xero_refresh_token: fresh.refresh_token,
            })
            .eq('id', biz.id)
          await pushToXero(biz.xero_tenant_id as string, token, dateStr, lineItems)
        } else {
          throw e
        }
      }

      await supabaseAdmin
        .from('pos_oauth_integrations')
        .update({ last_sync_at: new Date().toISOString() })
        .eq('business_id', biz.id)
        .eq('integration_key', 'xero')

      processed++
    } catch (e) {
      console.error(`[xero-sync] business ${biz.id}:`, (e as Error).message)
      errors++
    }
  }

  return NextResponse.json({ ok: true, date: dateStr, processed, errors })
}
