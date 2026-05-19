export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

const SEGMENTS = ['champions','loyal','regular','new','at_risk','hibernating','never_returned','needs_attention'] as const

async function _GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: uab } = await supabaseAdmin
    .from('user_active_business')
    .select('business_id')
    .eq('user_id', user.id)
    .maybeSingle()
  const bid = uab?.business_id
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  // supabaseAdmin bypasses RLS — pos_customers has RLS with no policies, user client returns 0 rows
  const { data: customers } = await supabaseAdmin
    .from('pos_customers')
    .select('id,segment,marketing_consent,phone,email')
    .eq('business_id', bid)

  const counts: Record<string, number> = { all: 0 }
  for (const seg of SEGMENTS) counts[seg] = 0

  for (const c of customers ?? []) {
    const cu = c as Record<string, unknown>
    if (!cu.marketing_consent) continue
    if (!cu.phone && !cu.email) continue
    counts.all++
    const seg = cu.segment as string | null
    if (seg && seg in counts) counts[seg]++
  }

  return NextResponse.json({ counts, business_id: bid })
}

export const GET = withErrorCapture('marketing/audience-counts', _GET)
