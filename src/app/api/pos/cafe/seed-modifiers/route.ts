export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { seedCafeModifierLibrary } from '@/lib/pos/cafe-modifier-seed'

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { business_id } = await req.json().catch(() => ({}))

  // Resolve business
  let bid = business_id
  if (!bid) {
    const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', user.id).maybeSingle()
    bid = active?.business_id
  }
  if (!bid) return NextResponse.json({ error: 'No active business' }, { status: 404 })

  const { data: biz } = await supabase.from('businesses').select('id, industry, name').eq('id', bid).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (biz.industry !== 'cafe') return NextResponse.json({ error: 'Modifier system is cafe-only at this stage' }, { status: 403 })

  // Check if already seeded
  const { count } = await supabase.from('pos_modifier_groups').select('id', { count: 'exact', head: true }).eq('business_id', bid)
  if ((count ?? 0) >= 12) {
    return NextResponse.json({ ok: true, message: 'Modifier library already seeded', groups: count, modifiers: null })
  }

  const result = await seedCafeModifierLibrary(supabase, bid)

  return NextResponse.json({ ok: true, message: `Seeded ${result.groups} groups and ${result.modifiers} modifiers for ${biz.name}`, ...result })
}

export const POST = withErrorCapture('pos/cafe/seed-modifiers', _POST)