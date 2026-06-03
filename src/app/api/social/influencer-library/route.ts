export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const industry = req.nextUrl.searchParams.get('industry')

  const { data, error } = await supabaseAdmin
    .from('aria_influencer_library')
    .select('id, name, description, image_url, higgsfield_job_id, soul_id, soul_status, industry_tags, style_tags, is_featured, usage_count')
    .eq('is_active', true)
    .order('is_featured', { ascending: false })
    .order('usage_count', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let influencers = data ?? []
  if (industry) {
    influencers = [
      ...influencers.filter(i => i.industry_tags?.includes(industry)),
      ...influencers.filter(i => !i.industry_tags?.includes(industry)),
    ]
    const seen = new Set<string>()
    influencers = influencers.filter(i => { if (seen.has(i.id)) return false; seen.add(i.id); return true })
  }

  return NextResponse.json({ influencers })
}

export const GET = withErrorCapture('social/influencer-library', _GET)
