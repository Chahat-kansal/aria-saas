export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { businessId, websiteUrl, triggerCrawl = true } = body

  if (!businessId || !websiteUrl) {
    return NextResponse.json({ error: 'businessId and websiteUrl required' }, { status: 400 })
  }

  // Validate and normalise URL
  let cleanUrl: string
  try {
    const raw = websiteUrl.trim()
    const withProtocol = raw.startsWith('http') ? raw : 'https://' + raw
    const parsed = new URL(withProtocol)
    cleanUrl = parsed.origin + parsed.pathname.replace(/\/$/, '')
  } catch {
    return NextResponse.json({ error: 'Invalid URL — please include your full website address e.g. https://yoursite.com.au' }, { status: 400 })
  }

  // Verify business ownership
  const { data: business, error: bizErr } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', businessId)
    .eq('user_id', user.id)
    .single()

  if (bizErr || !business) {
    return NextResponse.json({ error: 'Business not found' }, { status: 404 })
  }

  // Save URL to businesses.website (user client, RLS-scoped)
  const { error: updateErr } = await supabase
    .from('businesses')
    .update({ website: cleanUrl })
    .eq('id', businessId)

  if (updateErr) {
    console.error('[seo/connect] businesses update failed:', updateErr.message)
    return NextResponse.json({ error: 'Failed to save website URL: ' + updateErr.message }, { status: 500 })
  }

  // Queue crawl — user client works because RLS owner policy covers seo_audits
  if (triggerCrawl) {
    // Remove any existing pending audit
    await supabase
      .from('seo_audits')
      .delete()
      .eq('business_id', businessId)
      .eq('status', 'pending')

    // Insert fresh pending audit
    const { error: insertErr } = await supabase.from('seo_audits').insert({
      business_id: businessId,
      website_url: cleanUrl,
      status: 'pending',
      health_score: 0,
      pages_crawled: 0,
      issues_found: 0,
      issues_fixed: 0,
      created_at: new Date().toISOString(),
    })

    if (insertErr) {
      // Non-fatal — URL is saved, crawl will still run via daily cron
      console.error('[seo/connect] seo_audits insert failed (non-fatal):', insertErr.message)
    }
  }

  return NextResponse.json({
    success: true,
    website_url: cleanUrl,
    crawl_queued: triggerCrawl,
    message: 'Website connected. Crawl queued — results appear after the next daily run at 7 AM AEDT.',
  })
}
