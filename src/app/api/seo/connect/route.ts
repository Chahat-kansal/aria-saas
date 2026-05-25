export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

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
    const u = websiteUrl.startsWith('http') ? websiteUrl : 'https://' + websiteUrl
    const parsed = new URL(u)
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

  // Save URL to businesses.website (user client — owner scoped, fine)
  const { error: updateErr } = await supabase
    .from('businesses')
    .update({ website: cleanUrl })
    .eq('id', businessId)

  if (updateErr) {
    console.error('[seo/connect] update error:', updateErr.message)
    return NextResponse.json({ error: 'Failed to save website URL' }, { status: 500 })
  }

  // Queue crawl using inline admin client (avoids module-level bundling issues)
  if (triggerCrawl) {
    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Clear any existing pending audit then insert fresh
    await admin.from('seo_audits').delete().eq('business_id', businessId).eq('status', 'pending')

    const { error: insertErr } = await admin.from('seo_audits').insert({
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
      console.error('[seo/connect] audit insert error:', insertErr.message)
      // Non-fatal — URL saved, crawl will still happen via daily cron
    }

    // Log to aria_ai_calls (non-fatal)
    admin.from('aria_ai_calls').insert({
      business_id: businessId,
      agent_key: 'seo_connect',
      provider: 'internal',
      model_id: 'none',
      role: 'setup',
      success: true,
      request_summary: 'Connected website: ' + cleanUrl,
    }).catch(() => {})
  }

  return NextResponse.json({
    success: true,
    website_url: cleanUrl,
    crawl_queued: triggerCrawl,
    message: triggerCrawl
      ? 'Website connected. Crawl queued — results appear within 24 hours.'
      : 'Website URL saved.',
  })
}
