export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { signManagerToken } from '@/lib/pos/manager-token'
import { rateLimit, tooManyRequests } from '@/lib/security/rate-limit'

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // SEC-H1: throttle manager-PIN attempts per session (fail-closed — brute-force guard).
  const rl = await rateLimit(`pin:mgr:${user.id}`, 10, 60, { failClosed: true })
  if (!rl.allowed) return tooManyRequests(rl.retryAfter)

  const { pin } = await req.json()
  if (!pin) return NextResponse.json({ error: 'PIN required' }, { status: 400 })

  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', user.id).maybeSingle()
  const { data: biz } = await supabase.from('businesses').select('id').eq('user_id', user.id).eq('is_active', true).limit(1).maybeSingle()
  const bid = active?.business_id ?? biz?.id ?? null
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  // Find staff member with matching PIN
  const { data: staff } = await supabase
    .from('pos_users')
    .select('id, name, role, pin')
    .eq('business_id', bid)
    .eq('is_active', true)
    .in('role', ['manager', 'owner', 'admin'])
    .maybeSingle()

  if (!staff || staff.pin !== pin) {
    return NextResponse.json({ error: 'Invalid PIN' }, { status: 401 })
  }

  const token = signManagerToken(staff.id)
  return NextResponse.json({ ok: true, token, staff_name: staff.name, expires_in: 60 })
}

export const POST = withErrorCapture('pos/manager-verify', _POST)