export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

// TP-6 Part 1 — DETERMINISTIC starter-library mapping. These are LEGAL/compliance facts, so the
// set is hard-coded (no AI invention). Compliance courses are SHELLS framed as "track your team's
// certification" — they do NOT claim to certify anyone. Owner picks which to create as drafts.

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

interface StarterCourse {
  key: string; title: string; description: string
  tier: 'compliance' | 'skill' | 'systems' | 'culture'
  is_mandatory: boolean; expires_months: number | null; role_tags: string[]
  est_minutes: number; game_round?: string
}

const HOSPITALITY = ['cafe', 'restaurant', 'hospitality', 'food', 'bakery', 'bar', 'pub', 'catering', 'takeaway', 'coffee']
const looksLicensed = (subtype: string | null) => /bar|pub|licensed|liquor|tavern|club|brewery|winery/i.test(subtype ?? '')

function rsaStateNote(state: string | null): string {
  const s = (state ?? '').toUpperCase()
  if (s === 'NSW') return 'In NSW, RSA competency is issued through Liquor & Gaming NSW; the SH (responsible-gambling) module applies to gaming venues. Record each staff member\'s RSA competency card.'
  if (s === 'VIC') return 'In VIC, RSA is delivered through the SHARPR-aligned program via the VGCCC. Record each staff member\'s RSA certificate.'
  return 'RSA requirements vary by state — record each staff member\'s RSA competency and its issuing body.'
}

// Build the deterministic catalog from the business profile.
function buildCatalog(opts: { industry: string; state: string | null; subtype: string | null; alcohol: boolean }): StarterCourse[] {
  const isFood = HOSPITALITY.includes((opts.industry || '').toLowerCase()) || !opts.industry // default to hospitality for this POS product
  const out: StarterCourse[] = []

  if (isFood) {
    out.push({ key: 'food_safety', title: 'Food Safety — Food Handler', tier: 'compliance', is_mandatory: true, expires_months: 12, role_tags: [], est_minutes: 30,
      description: 'Track your team\'s Food Handler training. Upload your official food-safety material/cert and record who has completed it. (This course tracks completion — it is not itself an accredited certificate.)' })
    out.push({ key: 'food_safety_supervisor', title: 'Food Safety Supervisor', tier: 'compliance', is_mandatory: false, expires_months: 12, role_tags: ['Manager'], est_minutes: 30,
      description: 'For your nominated Food Safety Supervisor. Record their accredited FSS certificate and its renewal date.' })
  }

  if (opts.alcohol) {
    out.push({ key: 'rsa', title: 'Responsible Service of Alcohol (RSA)', tier: 'compliance', is_mandatory: true, expires_months: null, role_tags: [], est_minutes: 30,
      description: rsaStateNote(opts.state) + ' Upload the official RSA material and record each completion.' })
  }

  out.push({ key: 'barista', title: 'Barista Skills', tier: 'skill', is_mandatory: false, expires_months: null, role_tags: ['Barista'], est_minutes: 20,
    description: 'Espresso dialling-in, milk texturing, consistency and speed. Add your own method videos and a quiz.' })
  out.push({ key: 'customer_service', title: 'Customer Service', tier: 'skill', is_mandatory: false, expires_months: null, role_tags: [], est_minutes: 15,
    description: 'Greeting, handling complaints, upselling and the floor standard you expect.' })
  out.push({ key: 'opening_closing', title: 'Opening & Closing Procedures', tier: 'skill', is_mandatory: false, expires_months: null, role_tags: [], est_minutes: 15,
    description: 'Your open/close checklist as a trackable course — cash-up, cleaning, security.' })

  out.push({ key: 'run_pos', title: 'Run the POS', tier: 'systems', is_mandatory: true, expires_months: null, role_tags: ['Cashier'], est_minutes: 10, game_round: 'pos',
    description: 'A hands-on game: build the order, take payment, give the right change. Includes the interactive POS round.' })
  out.push({ key: 'spot_truth', title: 'Spot the Honest Answer', tier: 'systems', is_mandatory: false, expires_months: null, role_tags: [], est_minutes: 10, game_round: 'truth',
    description: 'A game that teaches grounded thinking — only one statement matches the data.' })

  out.push({ key: 'culture', title: 'Our Café — Values & Menu', tier: 'culture', is_mandatory: false, expires_months: null, role_tags: [], est_minutes: 15,
    description: 'Your story, values and menu knowledge. A culture course you (or Aria) fill in.' })

  return out
}

async function loadProfile(supabase: ReturnType<typeof createServerSupabaseClient>, bid: string) {
  const { data } = await supabase.from('businesses').select('industry, industry_subtype, business_state, business_subtype').eq('id', bid).maybeSingle()
  return {
    industry: String(data?.industry ?? ''),
    state: data?.business_state ? String(data.business_state) : null,
    subtype: data?.business_subtype ?? data?.industry_subtype ?? null,
  }
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ courses: [], alcohol_default: false })

  const profile = await loadProfile(supabase, bid)
  const { searchParams } = new URL(req.url)
  // alcohol: explicit query overrides; otherwise infer from subtype.
  const alcoholParam = searchParams.get('alcohol')
  const alcohol = alcoholParam != null ? alcoholParam === 'true' : looksLicensed(profile.subtype)

  // Which keys already exist as courses (so the UI can mark them).
  const catalog = buildCatalog({ ...profile, alcohol })
  const { data: existing } = await supabase.from('training_courses').select('title').eq('business_id', bid)
  const existingTitles = new Set((existing ?? []).map(c => String(c.title).toLowerCase()))
  const courses = catalog.map(c => ({ ...c, already_exists: existingTitles.has(c.title.toLowerCase()) }))

  return NextResponse.json({ courses, profile, alcohol_inferred: looksLicensed(profile.subtype), alcohol })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const keys: string[] = Array.isArray(body.keys) ? body.keys.map(String) : []
  const alcohol = !!body.alcohol
  if (keys.length === 0) return NextResponse.json({ error: 'Select at least one course' }, { status: 400 })

  const profile = await loadProfile(supabase, bid)
  const catalog = buildCatalog({ ...profile, alcohol })
  const chosen = catalog.filter(c => keys.includes(c.key))
  if (chosen.length === 0) return NextResponse.json({ error: 'No matching courses' }, { status: 400 })

  const created: string[] = []
  for (const c of chosen) {
    const { data: course, error } = await supabase.from('training_courses').insert({
      business_id: bid, title: c.title, description: c.description, tier: c.tier,
      role_tags: c.role_tags, is_mandatory: c.is_mandatory, pass_mark: 80,
      est_minutes: c.est_minutes, expires_months: c.expires_months, status: 'draft', created_by: user.id,
    }).select('id').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    created.push(course.id)
    // Auto-add the interactive game lesson for game-backed systems courses.
    if (c.game_round) {
      await supabase.from('training_lessons').insert({
        course_id: course.id, business_id: bid, sort_order: 0, type: 'game',
        title: c.title, game_round: c.game_round, duration_seconds: c.est_minutes * 60,
      })
    }
  }
  return NextResponse.json({ ok: true, created: created.length, course_ids: created })
}

export const GET = withErrorCapture('training/starter-library', _GET)
export const POST = withErrorCapture('training/starter-library', _POST)
