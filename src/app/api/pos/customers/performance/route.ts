export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _POST(req: Request) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({}, { status: 401 })

    const { business_id, customer_ids } = await req.json() as { business_id: string; customer_ids: string[] }
    if (!customer_ids?.length) return NextResponse.json({})

    const result: Record<string, number[]> = {}
    const since = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString()

    await Promise.all(customer_ids.slice(0, 50).map(async (id: string) => {
      const { data } = await supabase
        .from('pos_sales')
        .select('total_amount, created_at')
        .eq('business_id', business_id)
        .eq('customer_id', id)
        .gte('created_at', since)
        .order('created_at', { ascending: true })

      const monthly = Array(12).fill(0)
      ;(data || []).forEach(sale => {
        const monthsAgo = Math.floor(
          (Date.now() - new Date(sale.created_at).getTime()) / (30 * 24 * 3600 * 1000)
        )
        if (monthsAgo < 12) monthly[11 - monthsAgo] += (sale.total_amount || 0)
      })
      result[id] = monthly
    }))

    return NextResponse.json(result)
  } catch {
    return NextResponse.json({})
  }
}

export const POST = withErrorCapture('pos/customers/performance', _POST)
