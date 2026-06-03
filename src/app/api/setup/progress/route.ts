export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

const TASK_KEYS = ['add_product', 'test_sale', 'set_hours', 'invite_staff', 'connect_google'] as const
type TaskKey = typeof TASK_KEYS[number]

async function _GET(_req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: biz } = await supabase.from('businesses')
    .select('id, google_business_url')
    .eq('user_id', user.id).eq('is_active', true)
    .order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'No business' }, { status: 404 })

  // Cross-check real data to auto-complete tasks
  const [
    { count: productCount },
    { count: saleCount },
    { count: hoursCount },
    { count: staffCount },
    { data: progress },
  ] = await Promise.all([
    supabaseAdmin.from('pos_products').select('id', { count: 'exact', head: true }).eq('business_id', biz.id).eq('is_active', true),
    supabaseAdmin.from('pos_sales').select('id', { count: 'exact', head: true }).eq('business_id', biz.id).neq('status', 'voided'),
    supabaseAdmin.from('business_hours').select('id', { count: 'exact', head: true }).eq('business_id', biz.id),
    supabaseAdmin.from('staff_members').select('id', { count: 'exact', head: true }).eq('business_id', biz.id).eq('is_active', true),
    supabaseAdmin.from('business_setup_progress').select('*').eq('business_id', biz.id).maybeSingle(),
  ])

  const autoCompleted: TaskKey[] = []
  if ((productCount ?? 0) > 0) autoCompleted.push('add_product')
  if ((saleCount ?? 0) > 0) autoCompleted.push('test_sale')
  if ((hoursCount ?? 0) > 0) autoCompleted.push('set_hours')
  if ((staffCount ?? 0) > 0) autoCompleted.push('invite_staff')
  if (biz.google_business_url) autoCompleted.push('connect_google')

  const stored: TaskKey[] = progress?.completed_tasks ?? []
  const completedTasks = Array.from(new Set([...stored, ...autoCompleted]))

  if (!progress) {
    await supabaseAdmin.from('business_setup_progress').insert({
      business_id: biz.id,
      user_id: user.id,
      completed_tasks: completedTasks,
      dismissed: false,
    })
  } else if (autoCompleted.length > stored.length) {
    await supabaseAdmin.from('business_setup_progress').update({
      completed_tasks: completedTasks,
      updated_at: new Date().toISOString(),
    }).eq('business_id', biz.id)
  }

  return NextResponse.json({
    business_id: biz.id,
    completed_tasks: completedTasks,
    dismissed: progress?.dismissed ?? false,
    all_tasks: TASK_KEYS,
  })
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: biz } = await supabase.from('businesses')
    .select('id').eq('user_id', user.id).eq('is_active', true)
    .order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'No business' }, { status: 404 })

  const body = await req.json() as { task_key?: string; completed?: boolean; dismissed?: boolean }

  const { data: current } = await supabaseAdmin.from('business_setup_progress')
    .select('completed_tasks').eq('business_id', biz.id).maybeSingle()

  const existing: string[] = current?.completed_tasks ?? []

  if (body.dismissed !== undefined) {
    await supabaseAdmin.from('business_setup_progress').upsert({
      business_id: biz.id, user_id: user.id,
      completed_tasks: existing, dismissed: body.dismissed,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'business_id' })
    return NextResponse.json({ ok: true })
  }

  if (body.task_key) {
    let updated = [...existing]
    if (body.completed && !updated.includes(body.task_key)) {
      updated.push(body.task_key)
    } else if (!body.completed) {
      updated = updated.filter(t => t !== body.task_key)
    }
    await supabaseAdmin.from('business_setup_progress').upsert({
      business_id: biz.id, user_id: user.id,
      completed_tasks: updated,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'business_id' })
    return NextResponse.json({ ok: true, completed_tasks: updated })
  }

  return NextResponse.json({ error: 'Provide task_key or dismissed' }, { status: 400 })
}

export const GET = withErrorCapture('setup/progress', _GET)
export const PATCH = withErrorCapture('setup/progress', _PATCH)
