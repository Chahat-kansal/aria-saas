export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { issueStepupToken } from '@/lib/owner-app/decisions'

// OWNER-APP PH-1 — money decisions require step-up auth before approve. Re-verifies the owner's
// real password via Supabase Auth's own signInWithPassword (reusing Supabase's existing auth
// mechanism, not new crypto) before issuing a token via the existing manager-token HMAC signer
// (src/lib/pos/manager-token.ts) — a genuine re-auth, not a rubber stamp.
async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { password } = await req.json().catch(() => ({})) as { password?: string }
  if (!password) return NextResponse.json({ error: 'password required' }, { status: 400 })

  // A short-lived, unauthenticated client purely to exercise Supabase's own password check — never
  // persists a session, never touches the caller's real cookies.
  const authCheckClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  const { error } = await authCheckClient.auth.signInWithPassword({ email: user.email, password })
  if (error) return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 })

  return NextResponse.json({ stepup_token: issueStepupToken(user.id) })
}

export const POST = withErrorCapture('owner/decisions/stepup', _POST)
