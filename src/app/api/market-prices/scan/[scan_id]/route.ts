export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(_req: Request, { params }: { params: { scan_id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { scan_id } = params

  const { data: scan } = await supabaseAdmin
    .from('market_price_scans')
    .select('*')
    .eq('id', scan_id)
    .maybeSingle()

  if (!scan) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Verify ownership
  const { data: biz } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', scan.business_id as string)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  return NextResponse.json({ scan })
}

export const GET = withErrorCapture('market-prices/scan/[scan_id]', _GET)
