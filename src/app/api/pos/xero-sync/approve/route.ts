export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { refreshXeroToken } from '@/lib/integrations/oauth-clients/xero'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

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
        Narration: 'Aria POS — Daily Sales Summary ' + date,
        JournalLines: journalLines,
      }],
    }),
  })

  if (res.status === 401) throw new Error('XERO_401')
  if (!res.ok) {
    const body = await res.text()
    throw new Error('Xero ManualJournal POST ' + res.status + ': ' + body.slice(0, 200))
  }
  const json = await res.json() as { ManualJournals?: Array<{ ManualJournalID?: string }> }
  return json?.ManualJournals?.[0]?.ManualJournalID ?? ''
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json().catch(() => ({})) as {
    preview_id?: string
    approved_items?: string[]
  }
  const { preview_id, approved_items } = body
  if (!preview_id) return NextResponse.json({ error: 'preview_id required' }, { status: 400 })

  const { data: preview } = await supabaseAdmin
    .from('xero_sync_previews')
    .select('*')
    .eq('id', preview_id)
    .eq('business_id', bid)
    .maybeSingle()

  if (!preview) return NextResponse.json({ error: 'Preview not found' }, { status: 404 })
  if (preview.status !== 'pending') {
    return NextResponse.json({ error: 'Preview already ' + preview.status }, { status: 409 })
  }

  const { data: biz } = await supabase
    .from('businesses')
    .select('id, xero_access_token, xero_refresh_token, xero_tenant_id')
    .eq('id', bid)
    .eq('user_id', user.id)
    .single()

  if (!biz?.xero_access_token) {
    return NextResponse.json({ error: 'Xero not connected. Connect via Integrations.' }, { status: 400 })
  }

  const payload = preview.payload as PreviewPayload
  let lines: JournalLine[] = payload.journal_lines ?? []

  // Filter to approved items if subset provided
  if (approved_items && approved_items.length > 0) {
    lines = lines.filter(l => approved_items.includes(l.description))
  }

  if (!lines.length) return NextResponse.json({ error: 'No approved items to sync' }, { status: 400 })

  let accessToken = biz.xero_access_token as string
  const tenantId = biz.xero_tenant_id as string

  if (!tenantId) return NextResponse.json({ error: 'Xero organisation not set — reconnect Xero' }, { status: 400 })

  const attempt = () => pushManualJournal(accessToken, tenantId, String(preview.date), lines)

  let journalId: string
  try {
    journalId = await attempt()
  } catch (e) {
    if ((e as Error).message === 'XERO_401') {
      try {
        const fresh = await refreshXeroToken(biz.xero_refresh_token as string)
        accessToken = fresh.access_token
        await supabaseAdmin.from('businesses').update({
          xero_access_token: fresh.access_token,
          xero_refresh_token: fresh.refresh_token,
          xero_token_expires_at: new Date(Date.now() + fresh.expires_in * 1000).toISOString(),
        }).eq('id', bid)
        journalId = await attempt()
      } catch (e2) {
        const msg = (e2 as Error).message
        await supabaseAdmin.from('xero_sync_previews').update({ status: 'failed' }).eq('id', preview_id)
        return NextResponse.json({ error: msg }, { status: 500 })
      }
    } else {
      const msg = (e as Error).message
      await supabaseAdmin.from('xero_sync_previews').update({ status: 'failed' }).eq('id', preview_id)
      return NextResponse.json({ error: msg }, { status: 500 })
    }
  }

  const now = new Date().toISOString()
  await supabaseAdmin.from('xero_sync_previews').update({
    status: 'synced',
    synced_at: now,
    xero_journal_id: journalId,
  }).eq('id', preview_id)

  // Log to aria_autopilot_actions (non-fatal)
  try {
    await supabaseAdmin.from('aria_autopilot_actions').insert({
      business_id: bid,
      action_type: 'xero_sync',
      status: 'executed',
      action_data: { preview_id, xero_journal_id: journalId, date: preview.date },
    })
  } catch { /* non-fatal */ }

  return NextResponse.json({ ok: true, xero_journal_id: journalId })
}

export const POST = withErrorCapture('pos/xero-sync/approve', _POST)
