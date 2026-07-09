export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

// ABN-UNIQUE — recognize an existing business on this ABN before onboarding
// ever creates/finalizes a duplicate. Independent of /api/abn-lookup (which
// requires ABN_LOOKUP_GUID and hits the external ABR registry) — this check
// must work regardless of whether that external lookup is configured, since
// it's a same-database uniqueness check, not an ABR verification.
async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { abn?: string }
  const cleanAbn = (body.abn ?? '').replace(/\D/g, '')
  if (cleanAbn.length !== 11) return NextResponse.json({ duplicate: false })

  // Normalized comparison matches the businesses_abn_unique index expression.
  const { data: matches } = await supabaseAdmin
    .from('businesses')
    .select('id, name, user_id, abn')
    .not('abn', 'is', null)
    .neq('abn', '')

  const existing = (matches ?? []).find(b => String(b.abn ?? '').replace(/\D/g, '') === cleanAbn)
  if (!existing) return NextResponse.json({ duplicate: false })

  const ownedByMe = existing.user_id === user.id
  return NextResponse.json({
    duplicate: true,
    owned_by_me: ownedByMe,
    // Only reveal the business name/id when it's the requesting owner's own
    // business — never leak another owner's business details (privacy).
    business_id: ownedByMe ? existing.id : null,
    business_name: ownedByMe ? existing.name : null,
  })
}

export const POST = withErrorCapture('onboarding/check-abn', _POST)
