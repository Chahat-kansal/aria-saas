export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: biz } = await supabase.from('businesses').select('id').eq('user_id', user.id).eq('is_active', true).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json().catch(() => ({})) as {
    owner_priority?: string
    mode?: string
    agent_type?: string
    config?: Record<string, unknown>
  }

  const { owner_priority, mode, agent_type, config } = body
  const targetAgentType = agent_type ?? 'council'

  const { data: existing } = await supabaseAdmin
    .from('agent_settings')
    .select('config')
    .eq('business_id', biz.id)
    .eq('agent_type', targetAgentType)
    .maybeSingle()

  const mergedConfig = {
    ...((existing?.config as Record<string, unknown>) ?? {}),
    ...(config ?? {}),
    ...(owner_priority ? { priority: owner_priority } : {}),
  }

  const updates: Record<string, unknown> = {
    business_id: biz.id,
    agent_type: targetAgentType,
    config: mergedConfig,
    updated_at: new Date().toISOString(),
  }
  if (mode) updates.mode = mode
  if (owner_priority) updates.council_priority = owner_priority

  const { data: result, error } = await supabaseAdmin
    .from('agent_settings')
    .upsert(updates, { onConflict: 'business_id,agent_type' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ settings: result })
}

export const PATCH = withErrorCapture('agents/council/settings', _PATCH)
