export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { businessId, websiteUrl, triggerCrawl = true } = await req.json()
  if (!businessId || !websiteUrl) {
    return NextResponse.json({ error: 'businessId and websiteUrl required' }, { status: 400 })
  }

  // Validate and normalise URL
  let cleanUrl: string
  try {
    const parsed = new URL(websiteUrl.startsWith('http') ? websiteUrl : 'https://' + websiteUrl)
    cleanUrl = parsed.origin + parsed.pathname.replace(/\/$/, '')
  } catch {
    return NextResponse.json({ error: 'Invalid URL — please include your full website address' }, { status: 400 })
  }

  // Verify business ownership
  const { data: business } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', businessId)
    .eq('user_id', user.id)
    .single()
  if (!business) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  // Save URL to businesses.website
  await supabase.from('businesses').update({ website: cleanUrl }).eq('id', businessId)

  // Queue a crawl — delete any existing pending audit for this business and insert fresh
  if (triggerCrawl) {
    await supabaseAdmin
      .from('seo_audits')
      .delete()
      .eq('business_id', businessId)
      .eq('status', 'pending')

    await supabaseAdmin.from('seo_audits').insert({
      business_id: businessId,
      website_url: cleanUrl,
      status: 'pending',
      health_score: 0,
      pages_crawled: 0,
      issues_found: 0,
      issues_fixed: 0,
      created_at: new Date().toISOString(),
    })
  }

  // Log to aria_ai_calls
  supabaseAdmin.from('aria_ai_calls').insert({
    business_id: businessId,
    agent_key: 'seo_connect',
    provider: 'internal',
    model_id: 'none',
    role: 'setup',
    success: true,
    request_summary: `Connected website: ${cleanUrl}`,
  }).catch(() => {})

  return NextResponse.json({
    success: true,
    website_url: cleanUrl,
    crawl_queued: triggerCrawl,
    message: triggerCrawl
      ? 'Website connected. Crawl queued — results appear within 24 hours (or at 7 AM AEDT on the next run).'
      : 'Website URL saved.',
  })
}
