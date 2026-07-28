export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { getLabourRealtime } from '@/lib/aria/labour-realtime'

// OWNER-APP PH-1 — the computation itself moved to src/lib/aria/labour-realtime.ts (zero behavior
// change, same math/queries) so the owner-app's Today screen reads the same real-time labour% this
// route already exposed, instead of a second copy.
async function _GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: biz } = await supabaseAdmin
    .from('businesses').select('id').eq('user_id', user.id).eq('is_active', true).limit(1).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  const result = await getLabourRealtime(biz.id as string)
  return NextResponse.json(result)
}

export const GET = withErrorCapture('agents/labour/realtime', _GET)
