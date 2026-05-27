export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { refreshXeroToken } from '@/lib/integrations/oauth-clients/xero'
import { withErrorCapture } from '@/lib/api/with-error-capture'

interface LineItem {
  description: string
  quantity: number
  unit_amount: string
  account_code: string
  tax_type?: string
}

async function pushToXero(
  tenantId: string,
  accessToken: string,
  date: string,
  lineItems: LineItem[],
): Promise<string> {
  const res = await fetch('https://api.xero.com/api.xro/2.0/Invoices', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Xero-Tenant-Id': tenantId,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      Invoices: [{
        Type: 'ACCREC',
        Contact: { Name: 'POS Sales' },
        Date: date,
        DueDate: date,
        Status: 'AUTHORISED',
        LineItems: lineItems.map(li => ({
          Description: li.description,
          Quantity: li.quantity,
          UnitAmount: parseFloat(li.unit_amount),
          AccountCode: li.account_code ?? '200',
          TaxType: li.tax_type ?? 'OUTPUT2',
        })),
      }],
    }),
  })
  if (res.status === 401) throw new Error('XERO_401')
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Xero invoice POST ${res.status}: ${body.slice(0, 200)}`)
  }
  const json = await res.json() as { Invoices?: Array<{ InvoiceID?: string }> }
  return json?.Invoices?.[0]?.InvoiceID ?? ''
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, notes } = await req.json().catch(() => ({})) as { id?: string; notes?: string }
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { data: queue } = await supabaseAdmin
    .from('xero_sync_queue')
    .select('id, business_id, sync_date, status, line_items, total_sales, total_gst')
    .eq('id', id)
    .single()
  if (!queue) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: biz } = await supabase
    .from('businesses')
    .select('id, xero_access_token, xero_refresh_token, xero_tenant_id')
    .eq('id', queue.business_id)
    .eq('user_id', user.id)
    .single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (queue.status !== 'pending_review') {
    return NextResponse.json({ error: `Cannot approve: status is ${queue.status}` }, { status: 409 })
  }

  let accessToken = biz.xero_access_token as string
  const tenantId = biz.xero_tenant_id as string

  const attemptPush = async (): Promise<string> =>
    pushToXero(tenantId, accessToken, queue.sync_date as string, queue.line_items as LineItem[])

  let xeroInvoiceId: string
  try {
    xeroInvoiceId = await attemptPush()
  } catch (e) {
    if ((e as Error).message === 'XERO_401') {
      const fresh = await refreshXeroToken(biz.xero_refresh_token as string)
      accessToken = fresh.access_token
      await supabaseAdmin.from('businesses').update({
        xero_access_token: fresh.access_token,
        xero_refresh_token: fresh.refresh_token,
      }).eq('id', biz.id)
      try {
        xeroInvoiceId = await attemptPush()
      } catch (e2) {
        const msg = (e2 as Error).message
        await supabaseAdmin.from('xero_sync_queue').update({ status: 'failed', error_message: msg }).eq('id', id)
        return NextResponse.json({ error: msg }, { status: 500 })
      }
    } else {
      const msg = (e as Error).message
      await supabaseAdmin.from('xero_sync_queue').update({ status: 'failed', error_message: msg }).eq('id', id)
      return NextResponse.json({ error: msg }, { status: 500 })
    }
  }

  const now = new Date().toISOString()
  await supabaseAdmin.from('xero_sync_queue').update({
    status: 'sent',
    sent_at: now,
    reviewed_at: now,
    xero_invoice_id: xeroInvoiceId,
    notes: notes ?? null,
  }).eq('id', id)

  await supabaseAdmin.from('xero_sync_history').insert({
    business_id: queue.business_id,
    sync_date: queue.sync_date,
    total_sales: queue.total_sales,
    total_gst: queue.total_gst,
    xero_invoice_id: xeroInvoiceId,
    sent_by: 'owner',
  })

  return NextResponse.json({ ok: true, xero_invoice_id: xeroInvoiceId })
}

export const POST = withErrorCapture('integrations/xero/approve-sync', _POST)
