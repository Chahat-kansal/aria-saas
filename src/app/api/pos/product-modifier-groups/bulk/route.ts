export const dynamic = 'force-dynamic'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// Returns a cache map of product_id → { hasModifiers, hasVariants }
// Called once on terminal load to eliminate per-tap API round trips
export async function GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ cache: {} })

  const { searchParams } = new URL(req.url)
  const idsParam = searchParams.get('product_ids') ?? ''
  const ids = idsParam.split(',').filter(id => id.length > 10).slice(0, 200)

  if (!ids.length) return NextResponse.json({ cache: {} })

  // Fetch both modifier groups AND variants in parallel — single round trip
  const [modRes, varRes] = await Promise.all([
    supabaseAdmin
      .from('pos_product_modifier_groups')
      .select('product_id')
      .in('product_id', ids),
    supabaseAdmin
      .from('pos_product_variant_groups')
      .select('product_id')
      .in('product_id', ids),
  ])

  const withMods = new Set((modRes.data ?? []).map(r => r.product_id))
  const withVars = new Set((varRes.data ?? []).map(r => r.product_id))

  const cache: Record<string, { hasModifiers: boolean; hasVariants: boolean }> = {}
  for (const id of ids) {
    cache[id] = {
      hasModifiers: withMods.has(id),
      hasVariants: withVars.has(id),
    }
  }

  return NextResponse.json({ cache })
}
