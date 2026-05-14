export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createHmac } from 'crypto'
import { withErrorCapture } from '@/lib/api/with-error-capture'

const SECRET = process.env.MANAGER_TOKEN_SECRET ?? process.env.CRON_SECRET ?? 'aria-manager-fallback'

export function signManagerToken(staffId: string): string {
  const expiresAt = Date.now() + 60_000  // 60s
  const payload = `${staffId}:${expiresAt}`
  const sig = createHmac('sha256', SECRET).update(payload).digest('hex')
  return Buffer.from(`${payload}:${sig}`).toString('base64url')
}

export function verifyManagerToken(token: string): string | null {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8')
    const [staffId, expiresAtStr, sig] = decoded.split(':')
    if (!staffId || !expiresAtStr || !sig) return null
    const payload = `${staffId}:${expiresAtStr}`
    const expected = createHmac('sha256', SECRET).update(payload).digest('hex')
    if (sig !== expected) return null
    if (Date.now() > parseInt(expiresAtStr)) return null
    return staffId
  } catch { return null }
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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