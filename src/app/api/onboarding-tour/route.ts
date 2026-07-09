export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { TOUR_STEPS } from '@/lib/tour-steps'

async function getBiz(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data } = await supabase
    .from('businesses')
    .select('id, name, industry, slug')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return data
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
    .select('step, completed_steps, dismissed')
    .eq('business_id', biz.id)
    .maybeSingle()

  const { keys: autoCompleted, productCount, automations } = await computeAutoCompleted(biz.id)
  const stored: string[] = existing?.completed_steps ?? []
  // On the very first-ever load, show "products" as a celebratory first beat
  // even though it's already auto-completed (products are mandatory in
  // onboarding now) — otherwise the tour would skip straight past it and the
  // owner would never see "you've added N products" at all.
  const completedSteps = !existing
    ? autoCompleted.filter(k => k !== 'products')
    : Array.from(new Set([...stored, ...autoCompleted]))

  // Current step = first in defined order not yet completed.
  const currentStep = TOUR_STEPS.find(s => !completedSteps.includes(s.key))?.key ?? TOUR_STEPS[TOUR_STEPS.length - 1].key

  if (!existing) {
    await supabaseAdmin.from('onboarding_tour_progress').insert({
      business_id: biz.id, step: currentStep, completed_steps: completedSteps, dismissed: false,
    })
  } else if (completedSteps.length !== stored.length || existing.step !== currentStep) {
    await supabaseAdmin.from('onboarding_tour_progress').update({
      step: currentStep, completed_steps: completedSteps, updated_at: new Date().toISOString(),
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

  const body = await req.json().catch(() => ({})) as { complete_step?: string }
  const stepKey = body.complete_step
  if (!stepKey || !MANUAL_STEP_KEYS.has(stepKey)) {
    return NextResponse.json({ error: 'complete_step must be a manual step (' + Array.from(MANUAL_STEP_KEYS).join(', ') + ')' }, { status: 400 })
  }

  const { data: existing } = await supabaseAdmin
    .from('onboarding_tour_progress')
    .select('completed_steps')
    .eq('business_id', biz.id)
    .maybeSingle()

  const completedSteps = Array.from(new Set([...(existing?.completed_steps ?? []), stepKey]))
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

  await supabaseAdmin.from('onboarding_tour_progress').upsert({
    business_id: biz.id, dismissed: body.dismissed, updated_at: new Date().toISOString(),
  }, { onConflict: 'business_id' })

  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('onboarding-tour', _GET)
export const POST = withErrorCapture('onboarding-tour', _POST)
export const PATCH = withErrorCapture('onboarding-tour', _PATCH)
