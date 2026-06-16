export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params
  if (!token || token.length < 8) return NextResponse.json({ error: 'Invalid token' }, { status: 400 })

  const { data: output } = await supabaseAdmin
    .from('aria_task_outputs')
    .select('id, title, render_html, output_kind, created_at')
    .eq('share_token', token)
    .eq('is_public', true)
    .maybeSingle()

  if (!output) return NextResponse.json({ error: 'Not found or not public' }, { status: 404 })

  return NextResponse.json({
    ok: true,
    id: output.id,
    title: output.title,
    html: output.render_html,
    kind: output.output_kind,
    created_at: output.created_at,
  })
}
