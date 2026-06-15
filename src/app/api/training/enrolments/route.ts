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

// GET ?course_id= — owner view of who's enrolled on a course (status + progress per staff).
async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ enrolments: [] })

  const { searchParams } = new URL(req.url)
  const courseId = searchParams.get('course_id')
  let q = supabase.from('training_enrolments')
    .select('id, course_id, staff_member_id, status, progress_pct, due_at, completed_at, certified, staff_members(first_name, last_name, position)')
    .eq('business_id', bid)
  if (courseId) q = q.eq('course_id', courseId)
  const { data, error } = await q.order('assigned_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ enrolments: data ?? [] })
}

// POST — assign a published course. mode 'role' (staff whose position ∈ role_tags) or
// 'manual' (explicit staff_member_ids). Idempotent via UNIQUE(course_id, staff_member_id).
async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const courseId = String(body.course_id ?? '')
  const mode = body.mode === 'manual' ? 'manual' : 'role'
  if (!courseId) return NextResponse.json({ error: 'course_id required' }, { status: 400 })

  // Course must belong to this business and be published.
  const { data: course } = await supabase.from('training_courses')
    .select('id, role_tags, status').eq('id', courseId).eq('business_id', bid).maybeSingle()
  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 })
  if (course.status !== 'published') return NextResponse.json({ error: 'Publish the course before assigning' }, { status: 400 })

  const dueAt = body.due_at ? new Date(body.due_at).toISOString() : null

  // Resolve the target staff list.
  let staffIds: string[] = []
  if (mode === 'manual') {
    staffIds = Array.isArray(body.staff_member_ids) ? body.staff_member_ids.map(String) : []
    if (staffIds.length === 0) return NextResponse.json({ error: 'Select at least one staff member' }, { status: 400 })
    // Confirm each belongs to this business (never trust client ids).
    const { data: valid } = await supabase.from('staff_members').select('id').eq('business_id', bid).in('id', staffIds)
    staffIds = (valid ?? []).map(s => String(s.id))
  } else {
    const roleTags = (course.role_tags ?? []) as string[]
    if (roleTags.length === 0) return NextResponse.json({ error: 'This course has no role tags — assign manually or add roles first' }, { status: 400 })
    const wanted = new Set(roleTags.map(r => r.trim().toLowerCase()))
    const { data: staff } = await supabase.from('staff_members')
      .select('id, position').eq('business_id', bid).eq('status', 'active')
    staffIds = (staff ?? []).filter(s => wanted.has(String(s.position ?? '').trim().toLowerCase())).map(s => String(s.id))
    if (staffIds.length === 0) return NextResponse.json({ error: 'No active staff match this course’s roles', assigned: 0 }, { status: 200 })
  }

  // Upsert one enrolment per staff (idempotent). Do not overwrite progress on re-assign —
  // only set due_at via the conflict update if provided.
  const rows = staffIds.map(sid => ({ business_id: bid, course_id: courseId, staff_member_id: sid, due_at: dueAt }))
  const { error } = await supabase.from('training_enrolments')
    .upsert(rows, { onConflict: 'course_id,staff_member_id', ignoreDuplicates: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Return the resulting total assigned count for this course.
  const { count } = await supabase.from('training_enrolments')
    .select('id', { count: 'exact', head: true }).eq('course_id', courseId).eq('business_id', bid)
  return NextResponse.json({ ok: true, assigned: staffIds.length, total_enrolled: count ?? 0 })
}

// DELETE ?id= — owner un-assigns a staff member from a course.
async function _DELETE(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await supabase.from('training_enrolments').delete().eq('id', id).eq('business_id', bid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('training/enrolments', _GET)
export const POST = withErrorCapture('training/enrolments', _POST)
export const DELETE = withErrorCapture('training/enrolments', _DELETE)
