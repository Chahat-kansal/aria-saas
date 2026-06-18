export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getCommunityMember, ensureCommunityMember } from '@/lib/community/session'
import { supabaseAdmin } from '@/lib/supabase-admin'

// CX-ACCOUNT-CENTRE-1 — a MEMBER blocking a BUSINESS (member's perspective).
// Stored in community_member_blocks. This is the INVERSE of community_blocked_visitors (a business
// blocking a visitor), so it correctly never pollutes owners' block lists.

// GET — the member's blocked businesses.
export async function GET() {
  try {
    const member = await getCommunityMember()
    if (!member) return NextResponse.json({ blocks: [] })
    const { data } = await supabaseAdmin.from('community_member_blocks')
      .select('business_id, created_at, businesses(name, logo_url)')
      .eq('member_id', member.id)
      .order('created_at', { ascending: false })
    return NextResponse.json({ blocks: data ?? [] })
  } catch (err) {
    console.error('[community/block GET]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// POST { business_id } — block a business. Also hides + mutes any existing follow (defence in depth).
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({})) as { business_id?: string }
    if (!body.business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })
    const { data: biz } = await supabaseAdmin.from('businesses').select('id').eq('id', body.business_id).maybeSingle()
    if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

    const member = await ensureCommunityMember()
    const { error } = await supabaseAdmin.from('community_member_blocks')
      .upsert({ member_id: member.id, business_id: body.business_id }, { onConflict: 'member_id,business_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Stop hearing from them: mute notifications + marketing + hide any active follow.
    await supabaseAdmin.from('community_follows')
      .update({ is_hidden: true, notifications_on: false, consent_marketing: false })
      .eq('member_id', member.id).eq('business_id', body.business_id).is('unfollowed_at', null)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[community/block POST]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// DELETE ?business_id= — unblock.
export async function DELETE(req: Request) {
  try {
    const member = await getCommunityMember()
    if (!member) return NextResponse.json({ ok: true })
    const businessId = new URL(req.url).searchParams.get('business_id')
    if (!businessId) return NextResponse.json({ error: 'business_id required' }, { status: 400 })
    await supabaseAdmin.from('community_member_blocks').delete().eq('member_id', member.id).eq('business_id', businessId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[community/block DELETE]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
