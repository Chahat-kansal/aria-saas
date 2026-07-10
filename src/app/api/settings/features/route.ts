export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { ALL_FEATURES, getFeatureChoicesForBusiness, applyFeatureChoices } from '@/lib/industry-features'

// SETTINGS-FEATURES-1 — lets an owner change the feature choices they made
// (or accepted the defaults for) during onboarding's feature-set confirmation
// step, fulfilling that step's own "you can change any of this later in
// Settings" copy. Same resolution pattern as /api/features/disabled: prefer
// the active business, fall back to the owner's oldest active business.
async function resolveBusinessId(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string

  const { data: biz } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true)
    .order('created_at', { ascending: true }).limit(1).maybeSingle()
  return (biz?.id as string) ?? null
}

async function _GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const businessId = await resolveBusinessId(supabase, user.id)
  if (!businessId) return NextResponse.json({ error: 'No business' }, { status: 404 })

  const choices = await getFeatureChoicesForBusiness(businessId)
  const features = Object.values(ALL_FEATURES).map(f => ({
    key: f.key, label: f.label, description: f.description, enabled: choices[f.key] ?? true,
  }))

  return NextResponse.json({ features })
}

async function _POST(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const businessId = await resolveBusinessId(supabase, user.id)
  if (!businessId) return NextResponse.json({ error: 'No business' }, { status: 404 })

  const body = await req.json().catch(() => ({})) as { choices?: Record<string, boolean> }
  const choices = body.choices
  if (!choices || typeof choices !== 'object') return NextResponse.json({ error: 'choices required' }, { status: 400 })

  const validKeys = new Set(Object.keys(ALL_FEATURES))
  const sanitized = Object.fromEntries(
    Object.entries(choices).filter(([k, v]) => validKeys.has(k) && typeof v === 'boolean'),
  )

  await applyFeatureChoices(businessId, sanitized)
  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('settings/features', _GET)
export const POST = withErrorCapture('settings/features', _POST)
