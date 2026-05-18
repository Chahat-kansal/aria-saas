export const maxDuration = 60
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'



async function _POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as {
    message?: string; query?: string; messages?: { role: string; content: string }[]; conversation_id?: string
  }
  // Support both the new { message } shape and the old { messages: [...] } shape
  const message = String(body.message ?? body.query ?? body.messages?.filter(m => m.role === 'user').slice(-1)[0]?.content ?? '').trim()
  if (!message) return NextResponse.json({ message: 'No message provided' })

  // Forward to AA.1 architecture — forward cookies so auth session is preserved
  const newRes = await fetch(
    new URL('/api/aria/ask', request.url).toString(),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': request.headers.get('cookie') ?? '',
      },
      body: JSON.stringify({ message, conversation_id: body.conversation_id ?? null }),
    }
  )
  const data = await newRes.json() as { response?: string; conversation_id?: string; intent?: string; action?: unknown }
  // Return in shape compatible with both old and new callers
  return NextResponse.json({
    message: data.response ?? '',
    response: data.response ?? '',
    intent: data.intent,
    action: data.action,
    conversation_id: data.conversation_id,
  })
}

async function _GET(request: NextRequest) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  const { data: biz } = await supabase.from('businesses').select('id').eq('user_id', user.id).eq('is_active', true).limit(1).maybeSingle()
  if (!biz) return Response.json({ conversations: [] })

  if (id) {
    // Return recent role/content rows for this business as message history
    const { data } = await supabase.from('aria_conversations')
      .select('role, content, created_at')
      .eq('business_id', biz.id)
      .order('created_at', { ascending: true })
      .limit(100)
    return Response.json({ messages: (data ?? []).map(r => ({ role: r.role, content: r.content })) })
  }

  // Conversation list — return recent entries grouped by business
  const { data } = await supabase.from('aria_conversations')
    .select('id, created_at')
    .eq('business_id', biz.id)
    .order('created_at', { ascending: false })
    .limit(50)
  return Response.json({ conversations: data ?? [] })
}

export const GET = withErrorCapture('pos/ask', _GET)
export const POST = withErrorCapture('pos/ask', _POST)
