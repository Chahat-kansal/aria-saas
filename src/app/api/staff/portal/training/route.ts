export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { resolvePortalIdentity } from '@/lib/staff/portal'
import { supabaseAdmin } from '@/lib/supabase-admin'

// TP-3 — lessons are now INTERACTIVE.
//  - quiz: server-scored (the answer key `correct` NEVER leaves the server). Pass = score% ≥ course.pass_mark.
//  - game: a ported TRAIN-1 round reports a 0-100 score. Pass = GAME_PASS (60) — game scores are noisier
//    than quizzes, so we use a fixed, documented game threshold rather than the (typically higher) pass_mark.
//  - video/document/text/image/acknowledge/recipe: completed by viewing/acknowledging (no score).
// A lesson counts as DONE for course completion only when: non-graded → viewed; graded → best score ≥ threshold.
// Course completes + certifies only when EVERY lesson is done (graded lessons PASSED). Best score is kept on retake.
const GRADED = new Set(['quiz', 'game'])
const GAME_PASS = 60

type LessonRow = { id: string; type: string; score?: number | null }

// GET:
//   ?course_id=  → enrolment + lessons (sorted) + completed_lesson_ids + my per-lesson scores
//   ?lesson_id=  → quiz questions for that lesson, SANITISED (no `correct`) — only if enrolled
//   (none)       → my enrolments overview
async function _GET(req: Request) {
  const identity = await resolvePortalIdentity()
  if (!identity) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = supabaseAdmin
  const { searchParams } = new URL(req.url)
  const courseId = searchParams.get('course_id')
  const lessonId = searchParams.get('lesson_id')

  // ── Quiz questions for a lesson — SECURITY: never return `correct` to the client ──
  if (lessonId) {
    const { data: lesson } = await db.from('training_lessons').select('id, course_id, type').eq('id', lessonId).maybeSingle()
    if (!lesson || lesson.type !== 'quiz') return NextResponse.json({ error: 'Quiz lesson not found' }, { status: 404 })
    // Must be enrolled in this lesson's course.
    const { data: enrol } = await db.from('training_enrolments').select('id')
      .eq('staff_member_id', identity.staff_member_id).eq('business_id', identity.business_id).eq('course_id', lesson.course_id).maybeSingle()
    if (!enrol) return NextResponse.json({ error: 'Not enrolled' }, { status: 403 })
    // NOTE: deliberately NOT selecting `correct`.
    const { data: questions } = await db.from('training_quiz_questions')
      .select('id, sort_order, question, options, points').eq('lesson_id', lessonId).order('sort_order')
    return NextResponse.json({ questions: questions ?? [] })
  }

  if (!courseId) {
    const { data: enrols, error } = await db.from('training_enrolments')
      .select('id, course_id, status, progress_pct, score, due_at, completed_at, certified, training_courses(title, description, tier, est_minutes)')
      .eq('staff_member_id', identity.staff_member_id)
      .eq('business_id', identity.business_id)
      .order('due_at', { ascending: true, nullsFirst: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const courseIds = [...new Set((enrols ?? []).map(e => e.course_id))]
    const totals: Record<string, number> = {}
    if (courseIds.length) {
      const { data: lessons } = await db.from('training_lessons').select('id, course_id').in('course_id', courseIds)
      for (const l of lessons ?? []) totals[String(l.course_id)] = (totals[String(l.course_id)] ?? 0) + 1
    }
    const enrolments = (enrols ?? []).map(e => ({ ...e, total_lessons: totals[String(e.course_id)] ?? 0 }))
    return NextResponse.json({ enrolments })
  }

  // Single course: my enrolment + lessons + which I've completed + my scores.
  const { data: enrol } = await db.from('training_enrolments')
    .select('id, course_id, status, progress_pct, score, due_at, certified')
    .eq('staff_member_id', identity.staff_member_id)
    .eq('business_id', identity.business_id)
    .eq('course_id', courseId)
    .maybeSingle()
  if (!enrol) return NextResponse.json({ error: 'Not enrolled in this course' }, { status: 404 })

  const [{ data: course }, { data: lessons }, { data: progress }] = await Promise.all([
    db.from('training_courses').select('id, title, description, tier, pass_mark').eq('id', courseId).maybeSingle(),
    db.from('training_lessons').select('id, sort_order, type, title, content, url, recipe_id, game_round, duration_seconds').eq('course_id', courseId).order('sort_order'),
    db.from('training_lesson_progress').select('lesson_id, score').eq('enrolment_id', enrol.id),
  ])
  const scores: Record<string, number | null> = {}
  for (const p of progress ?? []) scores[String(p.lesson_id)] = p.score
  return NextResponse.json({
    enrolment: enrol,
    course,
    lessons: lessons ?? [],
    game_pass: GAME_PASS,
    completed_lesson_ids: (progress ?? []).map(p => String(p.lesson_id)),
    lesson_scores: scores,
  })
}

// POST — complete/score a lesson. Body:
//   { enrolment_id, lesson_id }                              → view-complete (non-graded)
//   { enrolment_id, lesson_id, answers:[{question_id,option_id}] } → quiz (server-scored)
//   { enrolment_id, lesson_id, score }                        → game round result (0-100)
async function _POST(req: Request) {
  const identity = await resolvePortalIdentity()
  if (!identity) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = supabaseAdmin

  const body = await req.json().catch(() => ({})) as { enrolment_id?: string; lesson_id?: string; answers?: Array<{ question_id?: string; option_id?: string }>; score?: number }
  const { enrolment_id, lesson_id } = body
  if (!enrolment_id || !lesson_id) return NextResponse.json({ error: 'enrolment_id and lesson_id required' }, { status: 400 })

  // Enrolment must be THIS staff member's, in their business.
  const { data: enrol } = await db.from('training_enrolments')
    .select('id, course_id, certified, completed_at')
    .eq('id', enrolment_id).eq('staff_member_id', identity.staff_member_id).eq('business_id', identity.business_id).maybeSingle()
  if (!enrol) return NextResponse.json({ error: 'Enrolment not found' }, { status: 404 })

  // Lesson must belong to this course.
  const { data: lesson } = await db.from('training_lessons').select('id, type').eq('id', lesson_id).eq('course_id', enrol.course_id).maybeSingle()
  if (!lesson) return NextResponse.json({ error: 'Lesson not in this course' }, { status: 404 })

  const { data: course } = await db.from('training_courses').select('pass_mark').eq('id', enrol.course_id).maybeSingle()
  const passMark = Number(course?.pass_mark ?? 80)

  // ── Compute this attempt's score (server-authoritative) ──
  let attemptScore: number | null = null
  let passed = true
  if (lesson.type === 'quiz') {
    // SECURITY: load the answer key SERVER-SIDE; the client never sees `correct`.
    const { data: questions } = await db.from('training_quiz_questions').select('id, correct, points').eq('lesson_id', lesson_id)
    const qs = questions ?? []
    const answerMap = new Map((body.answers ?? []).map(a => [String(a.question_id), String(a.option_id)]))
    let earned = 0, totalPts = 0
    for (const q of qs) {
      const pts = Number(q.points ?? 1)
      totalPts += pts
      if (answerMap.get(String(q.id)) === String(q.correct)) earned += pts
    }
    attemptScore = totalPts > 0 ? Math.round((earned / totalPts) * 100) : 100
    passed = attemptScore >= passMark
  } else if (lesson.type === 'game') {
    attemptScore = Math.max(0, Math.min(100, Math.round(Number(body.score ?? 0))))
    passed = attemptScore >= GAME_PASS
  }

  // ── Persist progress, keeping the BEST score on retake ──
  const { data: existing } = await db.from('training_lesson_progress')
    .select('id, score').eq('enrolment_id', enrolment_id).eq('lesson_id', lesson_id).maybeSingle()
  const isGraded = GRADED.has(lesson.type)
  if (existing) {
    if (isGraded) {
      const best = Math.max(Number(existing.score ?? 0), Number(attemptScore ?? 0))
      const { error } = await db.from('training_lesson_progress').update({ score: best, completed_at: new Date().toISOString() }).eq('id', existing.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
    // non-graded already complete → nothing to update
  } else {
    const { error } = await db.from('training_lesson_progress')
      .insert({ business_id: identity.business_id, enrolment_id, lesson_id, score: isGraded ? attemptScore : null })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // ── Roll up: a lesson is DONE when non-graded (row exists) or graded & best score passes ──
  const [{ data: allLessons }, { data: doneRows }] = await Promise.all([
    db.from('training_lessons').select('id, type').eq('course_id', enrol.course_id),
    db.from('training_lesson_progress').select('lesson_id, score').eq('enrolment_id', enrolment_id),
  ])
  const lessons = (allLessons ?? []) as LessonRow[]
  const total = lessons.length
  const progById = new Map((doneRows ?? []).map(r => [String(r.lesson_id), r.score as number | null]))
  const threshold = (t: string) => (t === 'game' ? GAME_PASS : passMark)
  const lessonDone = (l: LessonRow) => {
    if (!progById.has(String(l.id))) return false
    if (!GRADED.has(l.type)) return true
    return Number(progById.get(String(l.id)) ?? 0) >= threshold(l.type)
  }
  const doneCount = lessons.filter(lessonDone).length
  const progressPct = total > 0 ? Math.round((doneCount / total) * 100) : 0
  const allDone = total > 0 && lessons.every(lessonDone)

  // Course score = average of graded lessons' best scores (quizzes preferred; falls back to games).
  const gradedWithScore = lessons.filter(l => GRADED.has(l.type) && progById.has(String(l.id)))
  const quizWithScore = gradedWithScore.filter(l => l.type === 'quiz')
  const scorePool = (quizWithScore.length ? quizWithScore : gradedWithScore).map(l => Number(progById.get(String(l.id)) ?? 0))
  const courseScore = scorePool.length ? Math.round(scorePool.reduce((s, x) => s + x, 0) / scorePool.length) : null

  const patch: Record<string, unknown> = { progress_pct: progressPct }
  if (courseScore != null) patch.score = courseScore
  let certWritten = false
  if (allDone) {
    patch.status = 'complete'
    patch.completed_at = enrol.completed_at ?? new Date().toISOString()
    patch.certified = true
    certWritten = await maybeCertify(db, enrol.course_id, identity.business_id, identity.staff_member_id, enrol.certified)
  } else if (doneCount > 0 || progById.size > 0) {
    patch.status = 'in_progress'
  }

  const { error: upErr } = await db.from('training_enrolments').update(patch).eq('id', enrolment_id)
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    lesson_score: attemptScore,
    passed,
    pass_mark: lesson.type === 'game' ? GAME_PASS : passMark,
    progress_pct: progressPct,
    status: patch.status ?? 'assigned',
    certified: patch.certified === true,
    cert_written: certWritten,
  })
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
