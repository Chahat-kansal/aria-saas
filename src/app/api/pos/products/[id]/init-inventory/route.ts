export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

type Params = { params: Promise<{ id: string }> }

async function _POST(_req: Request, { params }: Params) {
  const { id } = await params
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: product } = await supabase
    .from('pos_products')
    .select('business_id')
    .eq('id', id)
    .maybeSingle()

  if (!product) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const bid = product.business_id as string

  const { data: outlets } = await supabase
    .from('pos_outlets')
    .select('id')
    .eq('business_id', bid)

  if (!outlets?.length) {
    // No outlets yet — create a default one then seed inventory
    const { data: newOutlet } = await supabase
      .from('pos_outlets')
      .insert({
        business_id: bid,
        name: 'Main Store',
        code: 'MAIN',
        is_default: true,
        is_active: true,
        active: true,
      })
      .select()
      .single()

    if (newOutlet) {
      await supabase.from('pos_outlet_inventory').insert({
        business_id: bid,
        product_id: id,
        outlet_id: newOutlet.id,
      })
    }
  } else {
    const records = outlets.map(o => ({
      business_id: bid,
      product_id: id,
      outlet_id: o.id,
    }))
    await supabase
      .from('pos_outlet_inventory')
      .upsert(records, { onConflict: 'product_id,outlet_id' })
  }

  return NextResponse.json({ ok: true })
}

export const POST = withErrorCapture('pos/products/[id]/init-inventory', _POST)