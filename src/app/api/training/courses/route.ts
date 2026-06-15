export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

const TIERS = ['compliance', 'skill', 'systems', 'culture']
const STATUSES = ['draft', 'published', 'archived']

// GET — every course for the business, with lessons + quiz questions nested (builder needs the
// whole tree), plus staff_skills for the grants-cert picker. RLS also scopes to the owner.
async function _GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ courses: [], skills: [] })

  const [coursesQ, skillsQ] = await Promise.all([
    supabase
      .from('training_courses')
      .select('*, training_lessons(*, training_quiz_questions(*))')
      .eq('business_id', bid)
      .order('created_at', { ascending: false }),
    supabase.from('staff_skills').select('id, name, color').eq('business_id', bid).order('sort_order'),
  ])
  if (coursesQ.error) return NextResponse.json({ error: coursesQ.error.message }, { status: 500 })

  // Sort the nested lessons by sort_order (PostgREST nested ordering is awkward; do it here).
  const courses = (coursesQ.data ?? []).map((c: Record<string, unknown>) => {
    const lessons = ((c.training_lessons as Array<Record<string, unknown>>) ?? [])
      .map(l => ({ ...l, training_quiz_questions: ((l.training_quiz_questions as Array<Record<string, unknown>>) ?? []).slice().sort((a, b) => Number(a.sort_order) - Number(b.sort_order)) }) as Record<string, unknown>)
      .sort((a, b) => Number(a.sort_order) - Number(b.sort_order))
    return { ...c, training_lessons: lessons }
  })

  return NextResponse.json({ courses, skills: skillsQ.data ?? [] })
}

// POST — create a course (always starts as draft, business_id from the verified session).
async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const title = String(body.title ?? '').trim()
  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 })
  const tier = TIERS.includes(body.tier) ? body.tier : null

  const { data, error } = await supabase.from('training_courses').insert({
    business_id: bid,
    title,
    description: body.description ?? null,
    tier,
    role_tags: Array.isArray(body.role_tags) ? body.role_tags.map(String) : [],
    is_mandatory: !!body.is_mandatory,
    pass_mark: Number.isFinite(Number(body.pass_mark)) ? Number(body.pass_mark) : 80,
    cert_skill_id: body.cert_skill_id || null,
    est_minutes: Number.isFinite(Number(body.est_minutes)) ? Number(body.est_minutes) : null,
    expires_months: Number.isFinite(Number(body.expires_months)) ? Number(body.expires_months) : null,
    status: 'draft',
    created_by: user.id,
  }).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ course: data }, { status: 201 })
}

// PATCH — update fields, publish (status→published) or archive. business_id never changes; the
// .eq('business_id', bid) guard + RLS prevents touching another business's course.
async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const id = String(body.id ?? '')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.title !== undefined) patch.title = String(body.title).trim()
  if (body.description !== undefined) patch.description = body.description ?? null
  if (body.tier !== undefined) patch.tier = TIERS.includes(body.tier) ? body.tier : null
  if (body.role_tags !== undefined) patch.role_tags = Array.isArray(body.role_tags) ? body.role_tags.map(String) : []
  if (body.is_mandatory !== undefined) patch.is_mandatory = !!body.is_mandatory
  if (body.pass_mark !== undefined) patch.pass_mark = Number(body.pass_mark) || 80
  if (body.cert_skill_id !== undefined) patch.cert_skill_id = body.cert_skill_id || null
  if (body.est_minutes !== undefined) patch.est_minutes = Number.isFinite(Number(body.est_minutes)) ? Number(body.est_minutes) : null
  if (body.expires_months !== undefined) patch.expires_months = Number.isFinite(Number(body.expires_months)) ? Number(body.expires_months) : null
  if (body.status !== undefined && STATUSES.includes(body.status)) patch.status = body.status

  const { data, error } = await supabase.from('training_courses')
    .update(patch).eq('id', id).eq('business_id', bid).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ course: data })
}

// DELETE — remove a course (lessons + questions cascade).
async function _DELETE(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabase.from('training_courses').delete().eq('id', id).eq('business_id', bid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('training/courses', _GET)
export const POST = withErrorCapture('training/courses', _POST)
export const PATCH = withErrorCapture('training/courses', _PATCH)
export const DELETE = withErrorCapture('training/courses', _DELETE)
