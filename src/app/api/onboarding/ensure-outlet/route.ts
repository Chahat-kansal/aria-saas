export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { ensureDefaultOutlet } from '@/lib/pos/ensure-default-outlet'
import { withErrorCapture } from '@/lib/api/with-error-capture'

// LAUNCH-PREP-1 — onboarding/connect/page.tsx's "Launch" button (the completion path most real
// onboarding flows actually end on) set onboarding_complete: true directly from the browser with
// no outlet-creation logic at all. This route lets that client component trigger the same
// canonical ensureDefaultOutlet server-side logic api/onboarding/provision/route.ts and
// api/settings/locations/route.ts now both use, without needing service-role access in the
// browser. Idempotent — safe to call even if an outlet already exists.
async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { business_id } = await req.json().catch(() => ({})) as { business_id?: string }
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses').select('id, name').eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await ensureDefaultOutlet(supabaseAdmin, biz.id as string, biz.name as string | null)
  return NextResponse.json({ ok: true })
}

export const POST = withErrorCapture('onboarding/ensure-outlet', _POST)
