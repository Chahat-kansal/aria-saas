export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { logAICallSafe } from '@/lib/aria/log-ai-call'
import { CAFE_CATEGORIES, CAFE_SEED_PRODUCTS } from '@/lib/pos/cafe-seed-products'
import { seedDefaultTrainingPack } from '@/lib/training/seed-default-pack'

type ProvStep = { step: string; label: string; status: 'pending' | 'running' | 'done' | 'failed'; error?: string }

const STEP_DEFS: ProvStep[] = [
  { step: 'categories', label: 'Setting up your menu & categories', status: 'pending' },
  { step: 'hours',      label: 'Configuring your trading hours',    status: 'pending' },
  { step: 'compliance', label: 'Preparing compliance tracking',     status: 'pending' },
  { step: 'briefing',   label: 'Briefing Aria on your business',    status: 'pending' },
  { step: 'finalize',   label: 'Finalising',                        status: 'pending' },
]

const INDUSTRY_CATEGORIES: Record<string, Array<{ name: string; color: string }>> = {
  cafe:       [{ name: 'Coffee', color: '#6F4E37' }, { name: 'Food', color: '#F59E0B' }, { name: 'Drinks', color: '#4A9EBA' }, { name: 'Extras', color: '#8B5CF6' }],
  retail:     [{ name: 'Spirits', color: '#B8854A' }, { name: 'Beer', color: '#D4956A' }, { name: 'Wine', color: '#7B4754' }, { name: 'Snacks', color: '#F59E0B' }],
  restaurant: [{ name: 'Mains', color: '#10B981' }, { name: 'Starters', color: '#F59E0B' }, { name: 'Drinks', color: '#4A9EBA' }, { name: 'Desserts', color: '#EC4899' }],
  salon:      [{ name: 'Hair', color: '#8B5CF6' }, { name: 'Nails', color: '#EC4899' }, { name: 'Treatments', color: '#7FB897' }],
  gym:        [{ name: 'Memberships', color: '#7FB897' }, { name: 'Classes', color: '#4A9EBA' }, { name: 'Products', color: '#F59E0B' }],
  tradie:     [{ name: 'Labour', color: '#7FB897' }, { name: 'Materials', color: '#4A9EBA' }, { name: 'Callouts', color: '#F59E0B' }],
  // ONBOARD-FIX-1 (addendum, point 3) — these 4 onboarding industry values had
  // no matching key here, silently falling to generic Products/Services.
  liquor:      [{ name: 'Wine', color: '#7B4754' }, { name: 'Beer', color: '#D4956A' }, { name: 'Spirits', color: '#B8854A' }, { name: 'Mixers', color: '#4A9EBA' }, { name: 'Ready-to-drink', color: '#F59E0B' }],
  convenience: [{ name: 'Snacks', color: '#F59E0B' }, { name: 'Drinks', color: '#4A9EBA' }, { name: 'Grocery', color: '#10B981' }, { name: 'Tobacco', color: '#8B5CF6' }, { name: 'Essentials', color: '#7FB897' }],
  bakery:      [{ name: 'Bread', color: '#B8854A' }, { name: 'Cakes', color: '#EC4899' }, { name: 'Pastries', color: '#F59E0B' }, { name: 'Drinks', color: '#4A9EBA' }],
}
const DEFAULT_CATEGORIES = [{ name: 'Products', color: '#7FB897' }, { name: 'Services', color: '#4A9EBA' }]

// Compliance item seeds use the actual compliance_items schema (title + category).
// Check-then-insert (not upsert) — no unique constraint exists on this table.
const COMPLIANCE_ITEMS: Record<string, Array<{ title: string; category: string }>> = {
  cafe:       [
    { title: 'Food Safety Certificate',         category: 'health' },
    { title: 'Food Safety Plan',                category: 'health' },
    { title: 'RSA Training Records',            category: 'licensing' },
    { title: 'Allergen Labelling Compliance',   category: 'health' },
  ],
  retail:     [
    { title: 'Staff RSA Certificates',          category: 'licensing' },
    { title: 'Fire Safety Inspection',          category: 'safety' },
    { title: 'Public Liability Insurance',      category: 'insurance' },
    { title: 'Hazardous Materials Compliance',  category: 'safety' },
  ],
  restaurant: [
    { title: 'Food Safety Certificate',         category: 'health' },
    { title: 'Food Safety Plan',                category: 'health' },
    { title: 'RSA Training Records',            category: 'licensing' },
    { title: 'Fire Safety Inspection',          category: 'safety' },
  ],
  salon:      [
    { title: 'Public Liability Insurance',      category: 'insurance' },
    { title: 'Product Safety Compliance',       category: 'safety' },
    { title: 'Fire Safety Inspection',          category: 'safety' },
  ],
  gym:        [
    { title: 'Public Liability Insurance',      category: 'insurance' },
    { title: 'First Aid Certificate',           category: 'health' },
    { title: 'Equipment Safety Checks',         category: 'safety' },
  ],
  tradie:     [
    { title: 'Public Liability Insurance',      category: 'insurance' },
    { title: 'WHS Policy',                      category: 'safety' },
    { title: 'Contractor Insurance',            category: 'insurance' },
  ],
}
const DEFAULT_COMPLIANCE_ITEMS = [
  { title: 'Public Liability Insurance',        category: 'insurance' },
  { title: 'Fire Safety Inspection',            category: 'safety' },
]

async function writeSteps(bizId: string, steps: ProvStep[]) {
  await supabaseAdmin
    .from('business_onboarding')
    .update({ provisioning_steps: steps })
    .eq('business_id', bizId)
}

async function runProvision(
  bizId: string,
  industry: string | null,
  businessModel: string | null,
  stepData: Record<string, unknown>,
  bizName: string,
) {
  const steps: ProvStep[] = STEP_DEFS.map(s => ({ ...s }))

  // Step 1: categories — CRITICAL for product businesses.
  // Categories are always upserted (idempotent) independent of the product-seed guard.
  // This fixes businesses that have existing products but 0 categories from a prior partial failure.
  steps[0].status = 'running'
  await writeSteps(bizId, steps)
  try {
    const categoryMap: Record<string, string> = {}
    if (businessModel !== 'service') {
      if (industry === 'cafe') {
        const CAFE_CAT_COLORS: Record<string, string> = {
          Coffee: '#6F4E37', Tea: '#7FB897', Breakfast: '#F59E0B',
          Lunch: '#10B981', Bakery: '#EC4899', 'Cold Drinks': '#4A9EBA',
        }
        for (const catName of CAFE_CATEGORIES) {
          const { data: cat, error: catErr } = await supabaseAdmin.from('pos_categories').upsert(
            { business_id: bizId, name: catName, color: CAFE_CAT_COLORS[catName] ?? '#7FB897' },
            { onConflict: 'business_id,name' }
          ).select('id').single()
          if (catErr) throw new Error('Category upsert failed (' + catName + '): ' + catErr.message)
          if (cat) categoryMap[catName] = cat.id as string
        }
        // Products only seeded once — idempotent guard prevents duplicates on re-run
        const { count: prodCount } = await supabaseAdmin
          .from('pos_products').select('id', { count: 'exact', head: true }).eq('business_id', bizId)
        if (!prodCount) {
          const products = CAFE_SEED_PRODUCTS.map(p => ({
            business_id: bizId, name: p.name, category_id: categoryMap[p.category] ?? null,
            price: p.price, cost_price: p.cost_price, description: p.description ?? null,
            image_url: p.image_url ?? null, image_source: p.image_url ? 'owner' : 'pending',
            stock_quantity: 999, track_stock: false, is_active: true,
          }))
          for (let i = 0; i < products.length; i += 20) {
            await supabaseAdmin.from('pos_products').insert(products.slice(i, i + 20))
          }
        }
      } else {
        for (const cat of (INDUSTRY_CATEGORIES[industry ?? ''] ?? DEFAULT_CATEGORIES)) {
          const { data: catRow, error: catErr } = await supabaseAdmin.from('pos_categories').upsert(
            { business_id: bizId, name: cat.name, color: cat.color },
            { onConflict: 'business_id,name' }
          ).select('id').single()
          if (catErr) throw new Error('Category upsert failed (' + cat.name + '): ' + catErr.message)
          if (catRow) categoryMap[cat.name] = catRow.id as string
        }
      }

      // BUG4 fix (ONBOARD-FIX-1) — owner-entered products from the onboarding
      // "products" step. Matched against the categories just seeded above by
      // name; an unrecognized category the owner typed gets created ad-hoc.
      const ownerProducts = Array.isArray(stepData.products) ? stepData.products as Array<Record<string, unknown>> : []
      for (const p of ownerProducts) {
        const name = String(p.name ?? '').trim()
        const priceNum = parseFloat(String(p.price ?? ''))
        if (!name || !Number.isFinite(priceNum) || priceNum <= 0) continue
        const catName = String(p.category ?? '').trim() || 'Products'
        let categoryId = categoryMap[catName]
        if (!categoryId) {
          const { data: newCat, error: newCatErr } = await supabaseAdmin.from('pos_categories').upsert(
            { business_id: bizId, name: catName, color: '#7FB897' },
            { onConflict: 'business_id,name' }
          ).select('id').single()
          if (!newCatErr && newCat) { categoryId = newCat.id as string; categoryMap[catName] = categoryId }
        }
        await supabaseAdmin.from('pos_products').insert({
          business_id: bizId, name, category_id: categoryId ?? null,
          price: priceNum, stock_quantity: 999, track_stock: false, is_active: true,
        })
      }
    }
    steps[0].status = 'done'
  } catch (e) {
    const msg = (e as Error).message ?? 'Category seeding failed'
    steps[0].status = 'failed'
    steps[0].error = msg
    console.error('[provision] categories step failed for', bizId + ':', msg)
    await writeSteps(bizId, steps)
    // CRITICAL — abort provisioning for product businesses so the owner lands on a retry screen,
    // not a silently broken empty dashboard.
    if (businessModel !== 'service') {
      throw new Error('Category setup failed: ' + msg)
    }
  }
  await writeSteps(bizId, steps)

  // ONBOARD-FIX-1 (addendum) — Aria derives default outlet + register + AU tax
  // codes from the same product seed, no separate wizard steps. Non-critical:
  // a missing outlet already falls back gracefully (CX locations page reads
  // the business's own address when pos_outlets is empty), so a failure here
  // must never abort onboarding the way a categories failure does.
  if (businessModel !== 'service') {
    try {
      const { count: outletCount } = await supabaseAdmin
        .from('pos_outlets').select('id', { count: 'exact', head: true }).eq('business_id', bizId)
      if (!outletCount) {
        const { data: biz } = await supabaseAdmin
          .from('businesses')
          .select('name, address, phone')
          .eq('id', bizId)
          .maybeSingle()
        const { data: outlet } = await supabaseAdmin
          .from('pos_outlets')
          .insert({
            business_id: bizId, name: (biz?.name as string) || bizName || 'Main location',
            address: (biz?.address as string) ?? null, phone: (biz?.phone as string) ?? null,
            is_default: true, is_active: true,
          })
          .select('id').single()
        if (outlet) {
          await supabaseAdmin.from('pos_registers').insert({
            business_id: bizId, outlet_id: outlet.id, name: 'Main Register', is_active: true,
          })
        }
      }
    } catch (e) { console.error('[non-fatal] default outlet seeding failed for', bizId, e) }

    try {
      const { count: taxCount } = await supabaseAdmin
        .from('pos_tax_codes').select('id', { count: 'exact', head: true }).eq('business_id', bizId)
      if (!taxCount) {
        const AU_TAX_CODES = [
          { code: 'GST',          name: 'GST 10%',                rate: 10, category: 'standard', is_inclusive: true },
          { code: 'GST_FREE',     name: 'GST-free',                rate: 0,  category: 'zero',     is_inclusive: true },
          { code: 'EXPORT',       name: 'Export — Zero Rated',      rate: 0,  category: 'zero',     is_inclusive: false },
          { code: 'INPUT_TAXED',  name: 'Input Taxed',              rate: 0,  category: 'exempt',   is_inclusive: true },
          { code: 'WET',          name: 'Wine Equalisation Tax 29%', rate: 29, category: 'special',  is_inclusive: false },
          { code: 'LCT',          name: 'Luxury Car Tax 33%',        rate: 33, category: 'luxury',   is_inclusive: false },
        ]
        await supabaseAdmin.from('pos_tax_codes').insert(
          AU_TAX_CODES.map(t => ({ ...t, business_id: bizId, is_system: true, is_active: true }))
        )
      }
    } catch (e) { console.error('[non-fatal] default tax codes seeding failed for', bizId, e) }
  }

  // Step 2: trading hours — non-critical
  steps[1].status = 'running'
  await writeSteps(bizId, steps)
  try {
    const { count } = await supabaseAdmin
      .from('business_hours')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', bizId)
    if (!count || count === 0) {
      // 0=Sun,1=Mon,...,6=Sat — seed Mon–Sat 9am–6pm, Sun 10am–5pm
      const hourRows = [
        { day_of_week: 1, open_time: '09:00', close_time: '18:00', is_closed: false },
        { day_of_week: 2, open_time: '09:00', close_time: '18:00', is_closed: false },
        { day_of_week: 3, open_time: '09:00', close_time: '18:00', is_closed: false },
        { day_of_week: 4, open_time: '09:00', close_time: '18:00', is_closed: false },
        { day_of_week: 5, open_time: '09:00', close_time: '18:00', is_closed: false },
        { day_of_week: 6, open_time: '09:00', close_time: '17:00', is_closed: false },
        { day_of_week: 0, open_time: '10:00', close_time: '17:00', is_closed: false },
      ]
      await supabaseAdmin.from('business_hours').insert(
        hourRows.map(r => ({ ...r, business_id: bizId }))
      )
    }
    steps[1].status = 'done'
  } catch (e) {
    const msg = (e as Error).message ?? 'Trading hours seeding failed'
    steps[1].status = 'failed'
    steps[1].error = msg
    console.error('[provision] hours step failed for', bizId + ':', msg)
  }
  await writeSteps(bizId, steps)

  // Step 3: compliance items — non-critical
  // Uses check-then-insert (not upsert) because compliance_items has no unique constraint
  // on (business_id, title). The previous upsert targeted columns that don't exist in the
  // live schema ('key', 'checked') and silently failed for every business.
  steps[2].status = 'running'
  await writeSteps(bizId, steps)
  try {
    const industryKey = industry ?? 'general'
    const items = COMPLIANCE_ITEMS[industryKey] ?? DEFAULT_COMPLIANCE_ITEMS
    for (const item of items) {
      const { count: existing } = await supabaseAdmin
        .from('compliance_items')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', bizId)
        .eq('title', item.title)
      if (!existing) {
        await supabaseAdmin.from('compliance_items').insert({
          business_id: bizId,
          industry: industryKey,
          title: item.title,
          category: item.category,
          is_completed: false,
        })
      }
    }
    steps[2].status = 'done'
  } catch (e) {
    const msg = (e as Error).message ?? 'Compliance seeding failed'
    steps[2].status = 'failed'
    steps[2].error = msg
    console.error('[provision] compliance step failed for', bizId + ':', msg)
  }
  await writeSteps(bizId, steps)

  // Step 4: first aria_daily_briefing — ONBOARD-FIX-1 (addendum): provisioning
  // must complete with ZERO AI calls. This used to call Anthropic synchronously
  // here; live logs showed 6+ AI calls firing around onboarding (this one plus
  // the dashboard's first-load cascade), all failing on "credit balance too
  // low" and one surfacing the raw error. A deterministic welcome message
  // ships immediately (no AI, can't fail); the real AI-generated briefing
  // arrives async via the existing daily-briefing-submit cron, which already
  // runs for every active business daily — no new queue infra needed.
  steps[3].status = 'running'
  await writeSteps(bizId, steps)
  try {
    const today = new Date().toISOString().split('T')[0]
    const { count: existing } = await supabaseAdmin
      .from('aria_daily_briefings')
      .select('business_id', { count: 'exact', head: true })
      .eq('business_id', bizId)
      .eq('briefing_date', today)
    if (!existing || existing === 0) {
      const ownerName = (stepData.owner_name as string) || 'there'
      const text = `Welcome aboard, ${ownerName} — Aria is now live for ${bizName}. Check your dashboard for today's insights and let's get started.`
      // BRIEF-INTEGRITY-2 — pipeline is part of the unique key now; the `existing` check above
      // (any pipeline, any row for today) still correctly guards against seeding a placeholder
      // welcome message over a real same-day briefing.
      await supabaseAdmin.from('aria_daily_briefings').upsert(
        { business_id: bizId, briefing_date: today, content: text, generated_at: new Date().toISOString(), source: 'onboarding_template', pipeline: 'onboarding' },
        { onConflict: 'business_id,briefing_date,pipeline' }
      )
    }
    steps[3].status = 'done'
  } catch (e) {
    const msg = (e as Error).message ?? 'Briefing seed failed'
    steps[3].status = 'failed'
    steps[3].error = msg
    console.error('[provision] briefing step failed for', bizId + ':', msg)
  }
  await writeSteps(bizId, steps)

  // TP-SEED — default day-one training pack. Non-fatal, idempotent.
  try { await seedDefaultTrainingPack(bizId, null, bizName) } catch (e) { console.error('[non-fatal] training seed', e) }

  // Step 5: finalize — only reached when all CRITICAL steps passed (no throw above)
  steps[4].status = 'running'
  await writeSteps(bizId, steps)
  await supabaseAdmin.from('businesses').update({ onboarding_complete: true }).eq('id', bizId)
  await supabaseAdmin.from('business_onboarding').update({
    current_step: 'complete',
    provisioning_status: 'complete',
    provisioning_steps: steps.map(s => ({ ...s, status: s.status === 'running' ? 'done' : s.status })),
  }).eq('business_id', bizId)

  // ARIA INTELLIGENCE — log onboarding completion (PP)
  await logAICallSafe({
    business_id: bizId,
    agent_key: 'onboarding',
    role: 'briefing',
    provider: 'anthropic',
    success: true,
    request_summary: JSON.stringify({ event: 'onboarding_complete', industry: industry ?? null, business_model: businessModel ?? null }),
  })
}

async function _GET(_req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: biz } = await supabaseAdmin
    .from('businesses')
    .select('id, name')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!biz) return NextResponse.json({ error: 'No business' }, { status: 404 })

  const { data: onb } = await supabaseAdmin
    .from('business_onboarding')
    .select('provisioning_status, provisioning_steps, provisioning_error')
    .eq('business_id', biz.id)
    .maybeSingle()

  return NextResponse.json({
    provisioning_status: onb?.provisioning_status ?? 'pending',
    provisioning_steps:  onb?.provisioning_steps  ?? [],
    provisioning_error:  onb?.provisioning_error  ?? null,
    business_name:       biz.name,
  })
}

async function _POST(_req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: biz } = await supabaseAdmin
    .from('businesses')
    .select('id, name, industry, business_model')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!biz) return NextResponse.json({ error: 'No business' }, { status: 404 })

  const { data: onb } = await supabaseAdmin
    .from('business_onboarding')
    .select('provisioning_status, step_data')
    .eq('business_id', biz.id)
    .maybeSingle()

  // Idempotent: already complete
  if (onb?.provisioning_status === 'complete') {
    return NextResponse.json({ provisioning_status: 'complete' })
  }

  if (!onb) {
    // Bootstrap row for businesses that pre-date the onboarding wizard.
    // Without this, every update/writeSteps call in runProvision silently no-ops.
    await supabaseAdmin.from('business_onboarding').insert({
      business_id: biz.id, user_id: user.id, current_step: 'provisioning',
      provisioning_status: 'running', step_data: {},
    })
  } else {
    await supabaseAdmin
      .from('business_onboarding')
      .update({ provisioning_status: 'running', provisioning_error: null })
      .eq('business_id', biz.id)
  }

  try {
    await runProvision(
      biz.id,
      (biz as Record<string, unknown>).industry as string | null,
      (biz as Record<string, unknown>).business_model as string | null,
      (onb?.step_data as Record<string, unknown>) ?? {},
      biz.name ?? 'your business',
    )
    return NextResponse.json({ provisioning_status: 'complete' })
  } catch (e) {
    const msg = (e as Error).message ?? 'Provisioning failed'
    await supabaseAdmin
      .from('business_onboarding')
      .update({ provisioning_status: 'failed', provisioning_error: msg })
      .eq('business_id', biz.id)
    return NextResponse.json({ provisioning_status: 'failed', error: msg }, { status: 500 })
  }
}

export const GET  = withErrorCapture('onboarding/provision', _GET)
export const POST = withErrorCapture('onboarding/provision', _POST)
