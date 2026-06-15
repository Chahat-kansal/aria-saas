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

const TYPES = ['video', 'document', 'image', 'text', 'quiz', 'game', 'recipe', 'acknowledge']

// Confirm the course belongs to this business before mutating its lessons.
async function ownsCourse(supabase: ReturnType<typeof createServerSupabaseClient>, courseId: string, bid: string) {
  const { data } = await supabase.from('training_courses').select('id').eq('id', courseId).eq('business_id', bid).maybeSingle()
  return !!data
}

// POST — add a lesson to a course. sort_order defaults to next-in-sequence.
async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const courseId = String(body.course_id ?? '')
  const type = String(body.type ?? '')
  if (!courseId) return NextResponse.json({ error: 'course_id required' }, { status: 400 })
  if (!TYPES.includes(type)) return NextResponse.json({ error: 'invalid lesson type' }, { status: 400 })
  if (!(await ownsCourse(supabase, courseId, bid))) return NextResponse.json({ error: 'Course not found' }, { status: 404 })

  let sortOrder = Number(body.sort_order)
  if (!Number.isFinite(sortOrder)) {
    const { data: last } = await supabase.from('training_lessons').select('sort_order').eq('course_id', courseId).order('sort_order', { ascending: false }).limit(1).maybeSingle()
    sortOrder = (last?.sort_order ?? -1) + 1
  }

  const { data, error } = await supabase.from('training_lessons').insert({
    course_id: courseId,
    business_id: bid,
    sort_order: sortOrder,
    type,
    title: body.title ?? null,
    content: body.content ?? null,
    url: body.url ?? null,
    recipe_id: body.recipe_id || null,
    game_round: body.game_round ?? null,
    duration_seconds: Number.isFinite(Number(body.duration_seconds)) ? Number(body.duration_seconds) : null,
  }).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ lesson: data }, { status: 201 })
}

// PATCH — update one lesson, OR reorder a batch ({ reorder: [{id, sort_order}, ...] }).
async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json().catch(() => ({}))

  if (Array.isArray(body.reorder)) {
    for (const row of body.reorder as Array<{ id: string; sort_order: number }>) {
      if (!row?.id) continue
      const { error } = await supabase.from('training_lessons')
        .update({ sort_order: Number(row.sort_order) || 0 }).eq('id', row.id).eq('business_id', bid)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  }

  const id = String(body.id ?? '')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const patch: Record<string, unknown> = {}
  if (body.title !== undefined) patch.title = body.title ?? null
  if (body.content !== undefined) patch.content = body.content ?? null
  if (body.url !== undefined) patch.url = body.url ?? null
  if (body.type !== undefined && TYPES.includes(body.type)) patch.type = body.type
  if (body.recipe_id !== undefined) patch.recipe_id = body.recipe_id || null
  if (body.game_round !== undefined) patch.game_round = body.game_round ?? null
  if (body.duration_seconds !== undefined) patch.duration_seconds = Number.isFinite(Number(body.duration_seconds)) ? Number(body.duration_seconds) : null
  if (body.sort_order !== undefined) patch.sort_order = Number(body.sort_order) || 0
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'nothing to update' }, { status: 400 })

  const { data, error } = await supabase.from('training_lessons')
    .update(patch).eq('id', id).eq('business_id', bid).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ lesson: data })
}

// DELETE — remove a lesson (quiz questions cascade).
async function _DELETE(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabase.from('training_lessons').delete().eq('id', id).eq('business_id', bid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export const POST = withErrorCapture('training/lessons', _POST)
export const PATCH = withErrorCapture('training/lessons', _PATCH)
export const DELETE = withErrorCapture('training/lessons', _DELETE)
