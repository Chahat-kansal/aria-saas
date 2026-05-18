// Alias for /api/pos/cash — same pos_cash_movements table.
// Exists so external clients can use a semantically clear URL.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ movements: [], balance: 0 })

  const today = new Date(); today.setHours(0, 0, 0, 0)

  const { data: cashMovements, error: movErr } = await supabase
    .from('pos_cash_movements')
    .select('*')
    .eq('business_id', bid)
    .gte('created_at', today.toISOString())
    .order('created_at', { ascending: false })
    .limit(100)

  if (movErr?.code === '42P01') {
    // Table doesn't exist — derive from cash sales
    const { data: todaySales } = await supabase.from('pos_sales')
      .select('id, total_amount, sale_number, created_at')
      .eq('business_id', bid)
      .eq('payment_method', 'cash')
      .neq('status', 'voided')
      .gte('created_at', today.toISOString())
    const movements = (todaySales ?? []).map(s => ({
      id: `sale:${s.id}`,
      type: 'cash_in',
      amount: Number(s.total_amount) || 0,
      note: `Sale ${s.sale_number}`,
      created_at: s.created_at,
    }))
    const balance = movements.reduce((sum, m) => sum + m.amount, 0)
    return NextResponse.json({ movements, balance })
  }

  if (movErr) return NextResponse.json({ error: movErr.message }, { status: 500 })
  const movements = cashMovements ?? []
  const balance = movements.reduce((sum, m) => {
    const sign = (m.type === 'cash_out' || m.type === 'cash_drop') ? -1 : 1
    return sum + sign * (Number(m.amount) || 0)
  }, 0)
  return NextResponse.json({ movements, balance })
}

export const GET = withErrorCapture('pos/cash-movements', _GET)
