export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { fetchMarketPrices } from '@/lib/orders/market-prices'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { data: _ab } = await supabase.from('user_active_business').select('business_id').eq('user_id', user.id).maybeSingle()
  const bid = (_ab?.business_id as string) ?? null
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const sp = req.nextUrl.searchParams
  const productId = sp.get('productId')
  const businessId = sp.get('businessId')
  const barcode = sp.get('barcode')
  const productName = sp.get('productName') ?? ''

  if (!productId || !businessId) {
    return NextResponse.json({ error: 'productId and businessId required' }, { status: 400 })
  }

  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), 5000)
    )
    const results = await Promise.race([
      fetchMarketPrices(productId, businessId, barcode, productName),
      timeout,
    ])
    return NextResponse.json({ results, cached: results.some(r => r.is_cached) })
  } catch {
    return NextResponse.json({ results: [], cached: false })
  }
}

export const GET = withErrorCapture('pos/orders/market-prices', _GET)
