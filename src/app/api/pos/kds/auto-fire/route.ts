export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { fireKdsTickets } from '@/lib/pos/kds-fire'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const { sale_id, outlet_id, table_label, items } = body

  if (!sale_id || !Array.isArray(items)) {
    return NextResponse.json({ error: 'sale_id and items required' }, { status: 400 })
  }

  // Verify sale belongs to this business
  const { data: sale } = await supabase.from('pos_sales').select('id').eq('id', sale_id).eq('business_id', bid).maybeSingle()
  if (!sale) return NextResponse.json({ error: 'Sale not found' }, { status: 404 })

  const result = await fireKdsTickets({
    business_id: bid,
    outlet_id: outlet_id ?? null,
    sale_id,
    table_label: table_label ?? null,
    items,
  })

  return NextResponse.json(result)
}

export const POST = withErrorCapture('pos/kds/auto-fire', _POST)
