export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: Request) {
  try {
    const { raw, type } = await req.json().catch(() => ({ raw: '', type: 'unknown' })) as { raw?: string; type?: string }
    await supabaseAdmin.from('aria_ai_calls').insert({
      business_id: '00000000-0000-0000-0000-000000000000',
      agent_key: 'artifact_parse_failure',
      provider: 'other',
      model_id: 'parser',
      success: false,
      error_message: `Failed to parse ${type ?? 'unknown'} artifact`,
      request_summary: ('[' + (type ?? 'unknown') + '] ' + (raw ?? '')).slice(0, 200),
      created_at: new Date().toISOString(),
    })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false })
  }
}
