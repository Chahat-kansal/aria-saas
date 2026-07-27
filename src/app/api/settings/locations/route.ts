export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { generateBusinessIdAndSlug } from '@/lib/slug'
import { ensureDefaultOutlet } from '@/lib/pos/ensure-default-outlet'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

// GET /api/settings/locations?parent_id=X — returns all sibling businesses
async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const parentId = searchParams.get('parent_id')
  if (!parentId) return NextResponse.json({ locations: [] })

  const { data, error } = await supabase
    .from('businesses')
    .select('id, name, city, address, plan, parent_account_id')
    .or('id.eq.' + parentId + ',parent_account_id.eq.' + parentId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ locations: data ?? [] })
}

// POST /api/settings/locations — creates a new sibling business
async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const name = String(body.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  // Get current business to read its parent_account_id
  const { data: currentBiz } = await supabase
    .from('businesses')
    .select('id, parent_account_id, industry, plan')
    .eq('id', bid)
    .maybeSingle()

  if (!currentBiz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  // Determine the parent_id: use existing parent or self
  const parentId = currentBiz.parent_account_id ?? currentBiz.id

  // If current biz has no parent yet, set it to point to itself as parent
  if (!currentBiz.parent_account_id) {
    await supabaseAdmin.from('businesses').update({ parent_account_id: currentBiz.id }).eq('id', currentBiz.id)
  }

  // Create the new sibling business. A business must NEVER exist without a
  // slug — generate id+slug up front (Sip Café pattern) and retry on the
  // rare unique-index collision.
  let newBiz: { id: string; name: string; city: string | null; address: string | null; plan: string | null } | null = null
  let insertErr: { message: string; code?: string } | null = null
  for (let attempt = 0; attempt < 5 && !newBiz; attempt++) {
    const { id, slug } = generateBusinessIdAndSlug(name)
    const { data, error } = await supabaseAdmin
      .from('businesses')
      .insert({
        id,
        slug,
        user_id: user.id,
        name,
        city: body.city || null,
        address: body.address || null,
        industry: currentBiz.industry ?? 'retail',
        plan: currentBiz.plan ?? 'starter',
        parent_account_id: parentId,
        is_active: true,
        onboarding_complete: true,
      })
      .select('id, name, city, address, plan')
      .single()
    if (!error) { newBiz = data; insertErr = null; break }
    insertErr = error
    if (error.code !== '23505') break // not a unique-violation — don't retry
  }

  if (!newBiz) return NextResponse.json({ error: insertErr?.message ?? 'Failed to create business' }, { status: 500 })

  // LAUNCH-PREP-1 — this route set onboarding_complete: true at insert time above with NO outlet
  // creation anywhere, meaning every "add another location" business landed in the exact
  // onboarded-but-outlet-less state the smoke suite found breaking the POS terminal.
  await ensureDefaultOutlet(supabaseAdmin, newBiz.id, newBiz.name)

  return NextResponse.json({ ok: true, business: newBiz }, { status: 201 })
}

export const GET = withErrorCapture('settings/locations', _GET)
export const POST = withErrorCapture('settings/locations', _POST)
