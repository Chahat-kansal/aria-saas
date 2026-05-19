export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { seedOnboardingMemories } from '@/lib/aria/memory/onboarding-seed'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: active } = await supabaseAdmin
    .from('user_active_business')
    .select('business_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase
    .from('businesses')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()
  return data?.id ?? null
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Accept explicit businessId from body, fall back to active business
  let businessId: string | null = null
  try {
    const body = await req.json().catch(() => ({}))
    businessId = (body as Record<string, unknown>).business_id as string ?? null
  } catch {
    // ignore
  }

  if (!businessId) businessId = await getBid(supabase, user.id)
  if (!businessId) return NextResponse.json({ error: 'No active business' }, { status: 400 })

  // Verify ownership
  const { data: biz } = await supabaseAdmin
    .from('businesses')
    .select('user_id')
    .eq('id', businessId)
    .maybeSingle()
  if (!biz || (biz as Record<string, unknown>).user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { inserted } = await seedOnboardingMemories(businessId)
  return NextResponse.json({ ok: true, inserted })
}

export const POST = withErrorCapture('aria/memory/seed-onboarding', _POST)
