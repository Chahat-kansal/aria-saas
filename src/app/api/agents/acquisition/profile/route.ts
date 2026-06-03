export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: biz } = await supabaseAdmin
    .from('businesses').select('id').eq('user_id', user.id).eq('is_active', true).limit(1).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  const [profileRes, contentRes, aeoRes] = await Promise.all([
    supabaseAdmin.from('business_aeo_profiles').select('*').eq('business_id', biz.id).maybeSingle(),
    supabaseAdmin.from('aeo_content_pieces').select('*').eq('business_id', biz.id).order('created_at', { ascending: false }).limit(20),
    supabaseAdmin.from('aeo_snapshots').select('query,appeared,recommendations,checked_at').eq('business_id', biz.id).order('checked_at', { ascending: false }).limit(20).then(r => r, () => ({ data: null })),
  ])

  return NextResponse.json({
    profile: profileRes.data ?? null,
    content: contentRes.data ?? [],
    aeo_snapshots: aeoRes.data ?? [],
  })
}

export const GET = withErrorCapture('agents/acquisition/profile', _GET)
