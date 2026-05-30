export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function refreshXeroToken(refreshToken: string): Promise<{ access_token: string; refresh_token: string } | null> {
  const clientId = process.env.XERO_CLIENT_ID
  const clientSecret = process.env.XERO_CLIENT_SECRET
  if (!clientId || !clientSecret) return null

  const res = await fetch('https://identity.xero.com/connect/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64'),
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  })
  if (!res.ok) return null
  const d = await res.json()
  return { access_token: d.access_token, refresh_token: d.refresh_token }
}

async function _POST(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: inv } = await supabaseAdmin.from('invoices').select('*').eq('id', params.id).maybeSingle()
  if (!inv) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: biz } = await supabase.from('businesses')
    .select('id, name, xero_refresh_token, xero_access_token, xero_tenant_id, xero_connected_at')
    .eq('id', inv.business_id).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!biz.xero_connected_at || !biz.xero_refresh_token) return NextResponse.json({ error: 'Xero not connected' }, { status: 400 })

  const tokens = await refreshXeroToken(biz.xero_refresh_token as string)
  if (!tokens) return NextResponse.json({ error: 'Xero token refresh failed' }, { status: 502 })

  await supabaseAdmin.from('businesses').update({
    xero_access_token: tokens.access_token,
    xero_refresh_token: tokens.refresh_token,
  }).eq('id', biz.id)

  const { data: lines } = await supabaseAdmin
    .from('invoice_line_items').select('*').eq('invoice_id', params.id).order('position')

  const xeroInvoice = {
    Type: 'ACCREC',
    InvoiceNumber: inv.invoice_number,
    Reference: inv.id,
    Contact: { Name: inv.bill_to_name, EmailAddress: inv.bill_to_email ?? '' },
    Date: (inv.issue_date as string | null)?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    DueDate: (inv.due_date as string | null)?.slice(0, 10) ?? '',
    Status: inv.status === 'paid' ? 'PAID' : 'AUTHORISED',
    LineAmountTypes: 'EXCLUSIVE',
    LineItems: (lines ?? []).map(l => ({
      Description: l.description,
      Quantity: Number(l.quantity) || 1,
      UnitAmount: Number(l.unit_price) || 0,
      TaxType: l.gst_applicable ? 'OUTPUT' : 'NONE',
      AccountCode: '200',
    })),
  }

  const xeroRes = await fetch('https://api.xero.com/api.xro/2.0/Invoices', {
    method: 'PUT',
    headers: {
      Authorization: 'Bearer ' + tokens.access_token,
      'Xero-Tenant-Id': biz.xero_tenant_id as string,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ Invoices: [xeroInvoice] }),
  })

  if (!xeroRes.ok) {
    const errText = await xeroRes.text().catch(() => xeroRes.statusText)
    return NextResponse.json({ error: 'Xero API error: ' + errText }, { status: 502 })
  }

  const xeroData = await xeroRes.json()
  const xeroInvId = xeroData?.Invoices?.[0]?.InvoiceID as string | undefined

  if (xeroInvId) {
    await supabaseAdmin.from('invoices').update({
      xero_invoice_id: xeroInvId,
      updated_at: new Date().toISOString(),
    }).eq('id', params.id)
  }

  return NextResponse.json({ ok: true, xero_invoice_id: xeroInvId })
}

export const POST = withErrorCapture('invoices/[id]/xero', _POST)
