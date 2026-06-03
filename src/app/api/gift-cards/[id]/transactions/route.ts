export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: biz } = await supabase.from('businesses')
    .select('id').eq('user_id', user.id).eq('is_active', true)
    .order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'No business' }, { status: 404 })

  const { data, error } = await supabaseAdmin
    .from('gift_card_transactions')
    .select('*')
    .eq('business_id', biz.id)
    .eq('gift_card_id', params.id)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ transactions: data ?? [] })
}

export const GET = withErrorCapture('gift-cards/[id]/transactions', _GET)
