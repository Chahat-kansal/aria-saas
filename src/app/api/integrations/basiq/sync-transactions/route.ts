export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { listTransactions, isConfigured } from '@/lib/integrations/basiq'

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!isConfigured()) return NextResponse.json({ error: 'BASIQ_API_KEY not configured' }, { status: 500 })

  const body = await req.json().catch(() => ({})) as { business_id?: string }
  const { business_id } = body
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data: biz } = await supabase
    .from('businesses')
    .select('id, basiq_user_id')
    .eq('id', business_id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!biz?.basiq_user_id) {
    return NextResponse.json({ error: 'No Basiq user — connect bank first' }, { status: 400 })
  }

  // Resolve account_id map (basiq_account_id → internal uuid)
  const { data: accts } = await supabaseAdmin
    .from('bank_accounts')
    .select('id, basiq_account_id')
    .eq('business_id', business_id)

  const idMap: Record<string, string> = {}
  for (const a of (accts ?? [])) {
    if (a.basiq_account_id) idMap[a.basiq_account_id as string] = a.id as string
  }

  const txns = await listTransactions(biz.basiq_user_id as string, 90)

  let synced = 0, skipped = 0
  for (const t of txns) {
    try {
      await supabaseAdmin.from('bank_transactions').upsert({
        business_id,
        basiq_transaction_id: t.id,
        account_id: idMap[t.account] ?? null,
        amount: Number(t.amount ?? 0),
        direction: t.direction ?? null,
        description: t.description ?? null,
        category: t.subClass?.title ?? t.class ?? null,
        transaction_date: t.postDate ?? t.transactionDate ?? null,
        posted_date: t.postDate ?? null,
        balance: Number(t.balance ?? 0),
      }, { onConflict: 'basiq_transaction_id' })
      synced++
    } catch {
      skipped++
    }
  }

  return NextResponse.json({ ok: true, synced, skipped, total: txns.length })
}

export const POST = withErrorCapture('integrations/basiq/sync-transactions', _POST)
