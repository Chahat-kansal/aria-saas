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

// The lesson must belong to this business AND be a quiz lesson.
async function ownsQuizLesson(supabase: ReturnType<typeof createServerSupabaseClient>, lessonId: string, bid: string) {
  const { data } = await supabase.from('training_lessons').select('id, type').eq('id', lessonId).eq('business_id', bid).maybeSingle()
  return data?.type === 'quiz'
}

// POST — add a question to a quiz lesson.
async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const lessonId = String(body.lesson_id ?? '')
  const question = String(body.question ?? '').trim()
  if (!lessonId) return NextResponse.json({ error: 'lesson_id required' }, { status: 400 })
  if (!question) return NextResponse.json({ error: 'question required' }, { status: 400 })
  if (!(await ownsQuizLesson(supabase, lessonId, bid))) return NextResponse.json({ error: 'Quiz lesson not found' }, { status: 404 })

  let sortOrder = Number(body.sort_order)
  if (!Number.isFinite(sortOrder)) {
    const { data: last } = await supabase.from('training_quiz_questions').select('sort_order').eq('lesson_id', lessonId).order('sort_order', { ascending: false }).limit(1).maybeSingle()
    sortOrder = (last?.sort_order ?? -1) + 1
  }

  const options = Array.isArray(body.options) ? body.options : []
  const { data, error } = await supabase.from('training_quiz_questions').insert({
    lesson_id: lessonId,
    business_id: bid,
    sort_order: sortOrder,
    question,
    options,
    correct: body.correct ?? null,
    points: Number.isFinite(Number(body.points)) ? Number(body.points) : 1,
  }).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ question: data }, { status: 201 })
}

// PATCH — update a question.
async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const id = String(body.id ?? '')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const patch: Record<string, unknown> = {}
  if (body.question !== undefined) patch.question = String(body.question).trim()
  if (body.options !== undefined) patch.options = Array.isArray(body.options) ? body.options : []
  if (body.correct !== undefined) patch.correct = body.correct ?? null
  if (body.points !== undefined) patch.points = Number(body.points) || 1
  if (body.sort_order !== undefined) patch.sort_order = Number(body.sort_order) || 0
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'nothing to update' }, { status: 400 })

  const { data, error } = await supabase.from('training_quiz_questions')
    .update(patch).eq('id', id).eq('business_id', bid).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ question: data })
}

// DELETE — remove a question.
async function _DELETE(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabase.from('training_quiz_questions').delete().eq('id', id).eq('business_id', bid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export const POST = withErrorCapture('training/quiz-questions', _POST)
export const PATCH = withErrorCapture('training/quiz-questions', _PATCH)
export const DELETE = withErrorCapture('training/quiz-questions', _DELETE)
