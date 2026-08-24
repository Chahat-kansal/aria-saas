export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'
import { resolveAutonomy, isPersistable, MODE_EXPLANATION, PERSISTABLE_MODES } from '@/lib/aria/autonomy'

/**
 * Read and write the REAL autonomy setting (agent_settings.mode).
 *
 * Tenant comes from the rail (MS13), never the client.
 *
 * MS16B PHASE 4 — all three modes persist. The CHECK constraint was widened on 24 Aug and verified
 * live before this route changed. Unknown values are still refused: widening the vocabulary is not
 * the same as accepting anything.
 */
async function _GET(_req: Request, _ctx: unknown, { businessId }: BusinessContext) {
  const { data, error } = await supabaseAdmin
    .from('agent_settings')
    .select('agent_type, mode, enabled')
    .eq('business_id', businessId)

  if (error) {
    console.error('[aria/autonomy] read failed:', error.message)
    // Never guess a mode — say the setting is unreadable and let the UI show that.
    return NextResponse.json({ error: 'unreadable' }, { status: 503 })
  }

  const state = resolveAutonomy(data as Array<{ agent_type: string; mode: string | null; enabled: boolean | null }>)
  return NextResponse.json({ ...state, explanations: MODE_EXPLANATION, modes: PERSISTABLE_MODES })
}

async function _POST(req: Request, _ctx: unknown, { businessId }: BusinessContext) {
  const body = await req.json().catch(() => ({})) as { mode?: string }
  const mode = String(body.mode ?? '')

  if (!isPersistable(mode)) {
    return NextResponse.json(
      { error: 'unknown_mode', mode, accepted: PERSISTABLE_MODES },
      { status: 400 },
    )
  }

  // Applied to every agent this business has settings for — the control is per-business.
  const { data: updated, error } = await supabaseAdmin
    .from('agent_settings')
    .update({ mode, updated_at: new Date().toISOString() })
    .eq('business_id', businessId)
    .select('agent_type')

  if (error) {
    console.error('[aria/autonomy] write failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // A business with no agent_settings rows updates nothing. That is a no-op, not a save, and
  // reporting it as success would leave the owner believing a setting they never got.
  if (!updated || updated.length === 0) {
    return NextResponse.json(
      { error: 'no_agents', message: 'There are no agent settings to apply this to yet.' },
      { status: 409 },
    )
  }

  const { data } = await supabaseAdmin
    .from('agent_settings')
    .select('agent_type, mode, enabled')
    .eq('business_id', businessId)

  const state = resolveAutonomy(data as Array<{ agent_type: string; mode: string | null; enabled: boolean | null }>)
  return NextResponse.json({ ...state, explanations: MODE_EXPLANATION, modes: PERSISTABLE_MODES })
}

export const GET = withBusinessContext('aria/autonomy:get', _GET)
export const POST = withBusinessContext('aria/autonomy:post', _POST)
