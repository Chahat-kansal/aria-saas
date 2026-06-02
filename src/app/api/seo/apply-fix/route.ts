export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

const MANUAL_TYPES = new Set(['slow_page', 'broken_link', 'broken_page'])

const NEXT_STEPS: Record<string, string> = {
  missing_title: 'Paste this title into your CMS page settings and republish.',
  title_too_long: 'Replace your current title with this shorter version in your CMS.',
  missing_meta_description: "Add this meta description to your page's SEO settings and republish.",
  meta_too_long: 'Replace your current meta description with this shorter version.',
  missing_h1: 'Add an H1 heading with this text to the top of your page content.',
  thin_content: 'Use these suggestions to expand the content on this page.',
  missing_schema: 'Add this JSON-LD inside a <script type="application/ld+json"> tag in your page <head>.',
  missing_alt_text: 'Update image alt attributes on this page following the guidance above.',
  slow_page: 'Implement the checklist above — compress images, enable caching, defer non-critical JS.',
  broken_link: 'Find all internal links pointing to this URL and either update or remove them.',
}

async function _POST(req: Request): Promise<Response> {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { issue_id?: string; fix_type?: string; fix_value?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }

  const { issue_id, fix_value } = body
  if (!issue_id) return NextResponse.json({ error: 'issue_id required' }, { status: 400 })

  const { data: issue } = await supabase
    .from('seo_issues')
    .select('id, business_id, issue_type, page_url')
    .eq('id', issue_id)
    .maybeSingle()
  if (!issue) return NextResponse.json({ error: 'Issue not found' }, { status: 404 })

  const { data: biz } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', issue.business_id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const issueType = issue.issue_type as string
  const isManual = MANUAL_TYPES.has(issueType)
  const newState = isManual ? 'flagged' : 'applied'

  const appliedAt = new Date().toISOString()

  await supabase.from('seo_issues').update({
    state: newState,
    applied_at: appliedAt,
    ai_fix_text: fix_value ?? null,
  }).eq('id', issue_id)

  // Log to seo_fixes for Fix History tab
  await supabaseAdmin.from('seo_fixes').insert({
    business_id: issue.business_id,
    issue_id: issue.id,
    issue_type: issueType,
    fix_applied: fix_value ?? null,
    state: newState,
    applied_at: appliedAt,
  })

  const baseStep = NEXT_STEPS[issueType] ?? (
    isManual
      ? 'This issue requires manual investigation.'
      : 'Apply the fix to your website and re-run the audit to verify.'
  )
  const next_steps = isManual ? `Manual fix required: ${baseStep}` : baseStep

  return NextResponse.json({ success: true, state: newState, next_steps })
}

export const POST = withErrorCapture('seo/apply-fix', _POST)
