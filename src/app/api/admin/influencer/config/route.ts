import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/admin'
export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { data } = await supabaseAdmin.from('aria_influencer_config')
    .select('*').eq('is_active', true).limit(1).maybeSingle()
  return NextResponse.json({ config: data })
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json()
  const { data: existing } = await supabaseAdmin.from('aria_influencer_config')
    .select('id').eq('is_active', true).limit(1).maybeSingle()
  if (existing) {
    await supabaseAdmin.from('aria_influencer_config').update({
      master_image_url: body.master_image_url,
      ariaos_instagram_account_id: body.ariaos_instagram_account_id,
      ariaos_page_access_token: body.ariaos_page_access_token,
      updated_at: new Date().toISOString(),
    }).eq('id', existing.id)
  } else {
    await supabaseAdmin.from('aria_influencer_config').insert({
      master_image_url: body.master_image_url,
      ariaos_instagram_account_id: body.ariaos_instagram_account_id,
      ariaos_page_access_token: body.ariaos_page_access_token,
      character_name: 'Aria',
    })
  }
  return NextResponse.json({ ok: true })
}
