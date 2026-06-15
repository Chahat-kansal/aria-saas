export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { ReconciliationAgent } from '@/lib/agents/reconciliation-agent'

// WIRE-4 — owner-triggered refresh: runs the reconciliation agent for THIS business now
// (daily reconciliation + expense anomalies + cash-flow forecast). The daily cron does this
// automatically; this lets the owner refresh on demand. Business-scoped.

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _POST() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })
  // Confirm ownership (never trust a resolved id alone).
  const { data: owns } = await supabaseAdmin.from('businesses').select('id').eq('id', bid).eq('user_id', user.id).maybeSingle()
  if (!owns) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const agent = new ReconciliationAgent()
  const result = await agent.run(bid, new Date(Date.now() - 86400000))
  return NextResponse.json({ ok: true, decisions: result.decisions.length, errors: result.errors.length })
}

export const POST = withErrorCapture('finance/generate', _POST)
