export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { resolvePortalIdentity } from '@/lib/staff/portal'
import { supabaseAdmin } from '@/lib/supabase-admin'

// Quiz/game lessons are placeholder-completable in TP-2 ("continue"); real interactive
// play + scoring is TP-3. Completion of the course is gated on the NON-(quiz/game) lessons,
// and the cert is only granted automatically when the course has no graded content yet
// (a course WITH a quiz waits for the pass in TP-3 → status can be complete but certified=false).
const GRADED = new Set(['quiz', 'game'])

// GET — list my enrolments (overview), or ?course_id= for one course's lessons + my progress.
async function _GET(req: Request) {
  const identity = await resolvePortalIdentity()
  if (!identity) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = supabaseAdmin
  const { searchParams } = new URL(req.url)
  const courseId = searchParams.get('course_id')

  if (!courseId) {
    const { data: enrols, error } = await db.from('training_enrolments')
      .select('id, course_id, status, progress_pct, due_at, completed_at, certified, training_courses(title, description, tier, est_minutes)')
      .eq('staff_member_id', identity.staff_member_id)
      .eq('business_id', identity.business_id)
      .order('due_at', { ascending: true, nullsFirst: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Attach lesson totals so the staff sees N lessons even before opening.
    const courseIds = [...new Set((enrols ?? []).map(e => e.course_id))]
    const totals: Record<string, number> = {}
    if (courseIds.length) {
      const { data: lessons } = await db.from('training_lessons').select('id, course_id').in('course_id', courseIds)
      for (const l of lessons ?? []) totals[String(l.course_id)] = (totals[String(l.course_id)] ?? 0) + 1
    }
    const enrolments = (enrols ?? []).map(e => ({ ...e, total_lessons: totals[String(e.course_id)] ?? 0 }))
    return NextResponse.json({ enrolments })
  }

  // Single course: my enrolment + the lessons (sorted) + which I've completed.
  const { data: enrol } = await db.from('training_enrolments')
    .select('id, course_id, status, progress_pct, due_at, certified')
    .eq('staff_member_id', identity.staff_member_id)
    .eq('business_id', identity.business_id)
    .eq('course_id', courseId)
    .maybeSingle()
  if (!enrol) return NextResponse.json({ error: 'Not enrolled in this course' }, { status: 404 })

  const [{ data: course }, { data: lessons }, { data: progress }] = await Promise.all([
    db.from('training_courses').select('id, title, description, tier, pass_mark').eq('id', courseId).maybeSingle(),
    db.from('training_lessons').select('id, sort_order, type, title, content, url, recipe_id, game_round, duration_seconds').eq('course_id', courseId).order('sort_order'),
    db.from('training_lesson_progress').select('lesson_id').eq('enrolment_id', enrol.id),
  ])
  return NextResponse.json({
    enrolment: enrol,
    course,
    lessons: lessons ?? [],
    completed_lesson_ids: (progress ?? []).map(p => String(p.lesson_id)),
  })
}

// POST — mark a lesson complete (idempotent), roll up progress, complete + certify when due.
async function _POST(req: Request) {
  const identity = await resolvePortalIdentity()
  if (!identity) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = supabaseAdmin

  const { enrolment_id, lesson_id } = await req.json().catch(() => ({})) as { enrolment_id?: string; lesson_id?: string }
  if (!enrolment_id || !lesson_id) return NextResponse.json({ error: 'enrolment_id and lesson_id required' }, { status: 400 })

  // The enrolment must be THIS staff member's, in their business (never trust client).
  const { data: enrol } = await db.from('training_enrolments')
    .select('id, course_id, certified, completed_at')
    .eq('id', enrolment_id)
    .eq('staff_member_id', identity.staff_member_id)
    .eq('business_id', identity.business_id)
    .maybeSingle()
  if (!enrol) return NextResponse.json({ error: 'Enrolment not found' }, { status: 404 })

  // Lesson must belong to this course.
  const { data: lesson } = await db.from('training_lessons').select('id').eq('id', lesson_id).eq('course_id', enrol.course_id).maybeSingle()
  if (!lesson) return NextResponse.json({ error: 'Lesson not in this course' }, { status: 404 })

  // Idempotent completion.
  const { error: progErr } = await db.from('training_lesson_progress')
    .upsert({ business_id: identity.business_id, enrolment_id, lesson_id }, { onConflict: 'enrolment_id,lesson_id', ignoreDuplicates: true })
  if (progErr) return NextResponse.json({ error: progErr.message }, { status: 500 })

  // Roll up: all lessons of the course, all my completed lesson rows.
  const [{ data: allLessons }, { data: doneRows }] = await Promise.all([
    db.from('training_lessons').select('id, type').eq('course_id', enrol.course_id),
    db.from('training_lesson_progress').select('lesson_id').eq('enrolment_id', enrolment_id),
  ])
  const lessons = allLessons ?? []
  const total = lessons.length
  const doneIds = new Set((doneRows ?? []).map(r => String(r.lesson_id)))
  const completed = lessons.filter(l => doneIds.has(String(l.id))).length
  const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0

  const requiredLessons = lessons.filter(l => !GRADED.has(String(l.type)))
  const requiredDone = requiredLessons.length > 0 ? requiredLessons.every(l => doneIds.has(String(l.id))) : completed === total && total > 0
  const hasGraded = lessons.some(l => GRADED.has(String(l.type)))

  const patch: Record<string, unknown> = { progress_pct: progressPct }
  let certWritten = false
  if (requiredDone) {
    patch.status = 'complete'
    patch.completed_at = enrol.completed_at ?? new Date().toISOString()
    // Certify automatically ONLY when there's no graded content to pass yet (TP-3 grants the
    // cert for quiz/game courses after a real pass). Idempotent.
    if (!hasGraded) {
      patch.certified = true
      certWritten = await maybeCertify(db, enrol.course_id, identity.business_id, identity.staff_member_id, enrol.certified)
    }
  } else if (completed > 0) {
    patch.status = 'in_progress'
  }

  const { error: upErr } = await db.from('training_enrolments').update(patch).eq('id', enrolment_id)
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, progress_pct: progressPct, status: patch.status ?? 'in_progress', certified: patch.certified === true, cert_written: certWritten })
}

// Insert the course's cert into staff_member_skills (3 cols), idempotent (skip if already held).
async function maybeCertify(
  db: typeof supabaseAdmin, courseId: string, businessId: string, staffMemberId: string, alreadyCertified: boolean,
): Promise<boolean> {
  if (alreadyCertified) return false
  const { data: course } = await db.from('training_courses').select('cert_skill_id').eq('id', courseId).eq('business_id', businessId).maybeSingle()
  const skillId = course?.cert_skill_id
  if (!skillId) return false
  const { data: existing } = await db.from('staff_member_skills')
    .select('staff_member_id').eq('staff_member_id', staffMemberId).eq('skill_id', skillId).maybeSingle()
  if (existing) return false
  const { error } = await db.from('staff_member_skills')
    .insert({ staff_member_id: staffMemberId, skill_id: skillId, certified_at: new Date().toISOString() })
  if (error) { console.error('[training cert insert failed]', error.message); return false }
  return true
}

export const GET = withErrorCapture('staff/portal/training', _GET)
export const POST = withErrorCapture('staff/portal/training', _POST)
