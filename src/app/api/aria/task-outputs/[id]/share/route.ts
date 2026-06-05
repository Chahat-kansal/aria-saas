export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { id: outputId } = await params

  const { data: output } = await supabaseAdmin
    .from('aria_task_outputs')
    .select('id, business_id, share_token, is_public')
    .eq('id', outputId)
    .maybeSingle()

  if (!output) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: biz } = await supabaseAdmin
    .from('businesses')
    .select('id')
    .eq('id', output.business_id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let token = output.share_token as string | null
  if (!token) {
    token = crypto.randomUUID().replace(/-/g, '').slice(0, 16)
    await supabaseAdmin
      .from('aria_task_outputs')
      .update({ share_token: token, is_public: true, shared_at: new Date().toISOString() })
      .eq('id', outputId)
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const shareUrl = appUrl + '/share/output/' + token

  return NextResponse.json({ ok: true, share_url: shareUrl, token })
}
