export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { TOUR_STEPS } from '@/lib/tour-steps'

async function getBiz(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data } = await supabase
    .from('businesses')
    .select('id, name, industry, slug, created_at')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return data
}

// TOUR-RESURRECT-FIX-1 — an established business (old enough, or already
// running real volume) must never have the tour auto-open just because a
// later sprint added a step it never saw. "Established" is computed from
// data that already exists — no new column needed for this part.
const ESTABLISHED_AGE_MS = 14 * 24 * 60 * 60 * 1000
const ESTABLISHED_SALE_COUNT = 50

async function isEstablishedBusiness(businessId: string, bizCreatedAt: string): Promise<boolean> {
  if (Date.now() - new Date(bizCreatedAt).getTime() > ESTABLISHED_AGE_MS) return true
  const { count } = await supabaseAdmin
    .from('pos_sales')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .neq('status', 'voided')
  return (count ?? 0) > ESTABLISHED_SALE_COUNT
}

// Steps with no real-data signal to auto-check (informational / can't be
// inferred) advance only via explicit POST from the tour UI.
const MANUAL_STEP_KEYS = new Set(['products', 'cx_app', 'ask_aria', 'aria_runs'])

async function computeAutoCompleted(businessId: string): Promise<{ keys: string[]; productCount: number; automations: string[] }> {
  const [
    { count: productCount },
    { count: saleCount },
    { count: staffCount },
    { count: hoursCount },
    { count: expenseCount },
    { count: cashMovementCount },
    { data: loyaltyConfig },
    { data: biz },
    { count: winbackCount },
    { count: reorderScheduleCount },
    { count: paymentSettingsCount },
  ] = await Promise.all([
    supabaseAdmin.from('pos_products').select('id', { count: 'exact', head: true }).eq('business_id', businessId).eq('is_active', true),
    supabaseAdmin.from('pos_sales').select('id', { count: 'exact', head: true }).eq('business_id', businessId).neq('status', 'voided'),
    supabaseAdmin.from('staff_members').select('id', { count: 'exact', head: true }).eq('business_id', businessId),
    supabaseAdmin.from('business_hours').select('id', { count: 'exact', head: true }).eq('business_id', businessId),
    supabaseAdmin.from('business_expenses').select('id', { count: 'exact', head: true }).eq('business_id', businessId),
    supabaseAdmin.from('pos_cash_movements').select('id', { count: 'exact', head: true }).eq('business_id', businessId),
    supabaseAdmin.from('pos_loyalty_config').select('program_enabled').eq('business_id', businessId).maybeSingle(),
    supabaseAdmin.from('businesses').select('google_business_url, google_place_id, morning_briefing_enabled, evening_briefing_enabled, weekly_report_enabled, review_auto_request_enabled').eq('id', businessId).maybeSingle(),
    supabaseAdmin.from('winback_automations').select('id', { count: 'exact', head: true }).eq('business_id', businessId).eq('is_active', true),
    supabaseAdmin.from('pos_reorder_schedules').select('id', { count: 'exact', head: true }).eq('business_id', businessId).eq('enabled', true),
    supabaseAdmin.from('pos_settings').select('id', { count: 'exact', head: true }).eq('business_id', businessId),
  ])

  const keys: string[] = []
  if ((productCount ?? 0) > 0) keys.push('products')
  if ((saleCount ?? 0) > 0) keys.push('test_sale')
  if ((staffCount ?? 0) > 0) keys.push('invite_staff')
  if ((cashMovementCount ?? 0) > 0) keys.push('cash_open')
  if ((paymentSettingsCount ?? 0) > 0) keys.push('payment_methods')
  if ((expenseCount ?? 0) > 0) keys.push('cash_flow')
  if (loyaltyConfig?.program_enabled) keys.push('loyalty')
  if ((hoursCount ?? 0) > 0) keys.push('set_hours')
  if (biz?.google_business_url || biz?.google_place_id) keys.push('connect_google')

  // ONBOARD-FIX-1 item 6 — the REAL, currently-wired-and-enabled automations
  // for THIS business, not a marketing list (RULE 9).
  const automations: string[] = []
  if (biz?.morning_briefing_enabled || biz?.evening_briefing_enabled) automations.push('Daily briefing')
  if (biz?.review_auto_request_enabled) automations.push('Review requests after a sale')
  if (loyaltyConfig?.program_enabled) automations.push('Loyalty points on every sale')
  if ((winbackCount ?? 0) > 0) automations.push('Win-back messages to quiet customers')
  if ((reorderScheduleCount ?? 0) > 0) automations.push('Low-stock reorder alerts')
  if (biz?.weekly_report_enabled) automations.push('Scheduled weekly reports')

  return { keys, productCount: productCount ?? 0, automations }
}

async function _GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const biz = await getBiz(supabase, user.id)
  if (!biz) return NextResponse.json({ error: 'No business' }, { status: 404 })

  const { data: existing } = await supabaseAdmin
    .from('onboarding_tour_progress')
    .select('step, completed_steps, dismissed, completed_at')
    .eq('business_id', biz.id)
    .maybeSingle()

  const { keys: autoCompleted, productCount, automations } = await computeAutoCompleted(biz.id)
  const stored: string[] = existing?.completed_steps ?? []
  const allStepKeys = TOUR_STEPS.map(s => s.key)

  // TOUR-RESURRECT-FIX-1 — once completed_at is set (natural full
  // completion, dismissal, or the established-business guard below),
  // EVERY current tour-steps.ts key is kept grandfathered into
  // completed_steps forever, regardless of whether a later sprint adds
  // steps this business never saw. That's what stops a new step from ever
  // re-opening a finished tour: currentStep can never resolve to anything
  // but the last step, and isLastStepDone (SpotlightTour's own render
  // guard) stays permanently true.
  let completedAt: string | null = existing?.completed_at ?? null
  const alreadySnapshotted = !!completedAt
  const established = alreadySnapshotted ? false : await isEstablishedBusiness(biz.id, biz.created_at)

  let completedSteps: string[]
  if (alreadySnapshotted || established) {
    completedSteps = Array.from(new Set([...stored, ...autoCompleted, ...allStepKeys]))
    if (!completedAt) completedAt = new Date().toISOString()
  } else {
    // On the very first-ever load, show "products" as a celebratory first
    // beat even though it's already auto-completed (products are mandatory
    // in onboarding now) — otherwise the tour would skip straight past it
    // and the owner would never see "you've added N products" at all.
    completedSteps = !existing
      ? autoCompleted.filter(k => k !== 'products')
      : Array.from(new Set([...stored, ...autoCompleted]))
    // Natural full completion — every step that exists RIGHT NOW is done —
    // snapshot it too, so a step added tomorrow can't resurrect this tour.
    if (allStepKeys.every(k => completedSteps.includes(k))) {
      completedAt = new Date().toISOString()
    }
  }

  // Current step = first in defined order not yet completed.
  const currentStep = TOUR_STEPS.find(s => !completedSteps.includes(s.key))?.key ?? TOUR_STEPS[TOUR_STEPS.length - 1].key

  if (!existing) {
    await supabaseAdmin.from('onboarding_tour_progress').insert({
      business_id: biz.id, step: currentStep, completed_steps: completedSteps, dismissed: false,
      completed_at: completedAt,
    })
  } else if (completedSteps.length !== stored.length || existing.step !== currentStep || (completedAt && !existing.completed_at)) {
    await supabaseAdmin.from('onboarding_tour_progress').update({
      step: currentStep, completed_steps: completedSteps, updated_at: new Date().toISOString(),
      completed_at: completedAt,
    }).eq('business_id', biz.id)
  }

  return NextResponse.json({
    step: currentStep,
    completed_steps: completedSteps,
    dismissed: existing?.dismissed ?? false,
    business_name: biz.name ?? 'your business',
    industry: biz.industry ?? 'retail',
    product_count: productCount,
    slug: biz.slug ?? null,
    automations,
  })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const biz = await getBiz(supabase, user.id)
  if (!biz) return NextResponse.json({ error: 'No business' }, { status: 404 })

  const body = await req.json().catch(() => ({})) as { complete_step?: string; skip_step?: string }
  const stepKey = body.complete_step
  const skipKey = body.skip_step

  // skip_step is the "never trap the owner" escape hatch — unlike
  // complete_step (gated to the manual, no-real-signal steps), it accepts
  // ANY real tour step key, so a broken CTA or an unreachable feature can
  // always be skipped past instead of stalling the whole tour.
  let keyToMark: string
  if (skipKey) {
    if (!TOUR_STEPS.some(s => s.key === skipKey)) {
      return NextResponse.json({ error: 'skip_step must be a real tour step key' }, { status: 400 })
    }
    keyToMark = skipKey
  } else {
    if (!stepKey || !MANUAL_STEP_KEYS.has(stepKey)) {
      return NextResponse.json({ error: 'complete_step must be a manual step (' + Array.from(MANUAL_STEP_KEYS).join(', ') + ')' }, { status: 400 })
    }
    keyToMark = stepKey
  }

  const { data: existing } = await supabaseAdmin
    .from('onboarding_tour_progress')
    .select('completed_steps')
    .eq('business_id', biz.id)
    .maybeSingle()

  const completedSteps = Array.from(new Set([...(existing?.completed_steps ?? []), keyToMark]))
  const nextStep = TOUR_STEPS.find(s => !completedSteps.includes(s.key))?.key ?? TOUR_STEPS[TOUR_STEPS.length - 1].key

  await supabaseAdmin.from('onboarding_tour_progress').upsert({
    business_id: biz.id, step: nextStep, completed_steps: completedSteps, updated_at: new Date().toISOString(),
  }, { onConflict: 'business_id' })

  return NextResponse.json({ ok: true, step: nextStep, completed_steps: completedSteps })
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const biz = await getBiz(supabase, user.id)
  if (!biz) return NextResponse.json({ error: 'No business' }, { status: 404 })

  const body = await req.json().catch(() => ({})) as { dismissed?: boolean }
  if (body.dismissed === undefined) return NextResponse.json({ error: 'dismissed required' }, { status: 400 })

  // TOUR-RESURRECT-FIX-1 — dismissing IS a completion signal (requirement
  // 1: "set completed_at... or dismisses"). Only stamp it on dismissed:true
  // — the UI never sends dismissed:false, but if it ever did, un-dismissing
  // shouldn't un-snapshot a completion that already happened.
  const updates: Record<string, unknown> = {
    business_id: biz.id, dismissed: body.dismissed, updated_at: new Date().toISOString(),
  }
  if (body.dismissed) updates.completed_at = new Date().toISOString()

  await supabaseAdmin.from('onboarding_tour_progress').upsert(updates, { onConflict: 'business_id' })

  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('onboarding-tour', _GET)
export const POST = withErrorCapture('onboarding-tour', _POST)
export const PATCH = withErrorCapture('onboarding-tour', _PATCH)
