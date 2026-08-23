export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import Anthropic from '@anthropic-ai/sdk'
import { buildNavGrounding } from '@/lib/aria/nav-grounding'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const MOOD_TAG_INSTRUCTION = `End every response with a mood tag and gesture tag on the same line:
- Good news / positive: [mood:happy][gesture:thumbup]
- Analysing / thinking: [mood:thinking][gesture:index]
- Problem / concern: [mood:concerned][gesture:shrug]
- Confirming action done: [mood:happy][gesture:ok]
- Greeting the user: [mood:happy][gesture:handup]
Do not include these tags in the spoken text — they are formatting instructions only.`

const SYSTEM_PROMPT = buildNavGrounding() + `

---

You are Aria, a helpful assistant for café and retail staff. You answer questions about shifts, leave, messages, daily operations, and how to navigate the staff portal. Keep responses ≤2 sentences (~160 chars max) — warm, direct, and practical. For detailed topics, give the key point and offer "Want the full breakdown?" at the end.

You do NOT have access to revenue figures, profit margins, or financial data. Stick to staff-relevant topics.

${MOOD_TAG_INSTRUCTION}`

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({})) as {
    message?: string
    messages?: Array<{ role: 'user' | 'assistant'; content: string }>
    page_context?: { route?: string; page_name?: string }
    business_id?: unknown
    businessId?: unknown
  }
  // MS13 PHASE 2 — JUDGED VARIANCE within the pre-authorised scope, recorded in RUN-MS13.md:
  // this route reads ZERO tenant data (nav grounding + static prompt only) and serves staff
  // portal users, who are NOT business owners — forcing the owner rail here would break every
  // staff user (RULE 0). The fix that applies is the other half of the pre-authorisation:
  // tenant-shaped input is REJECTED so nothing client-supplied can ever become a tenant key,
  // and any future tenant read added here must start from the rail, not from the body.
  if (body.business_id !== undefined || body.businessId !== undefined) {
    return NextResponse.json({ error: 'business_id is resolved server-side — do not send it' }, { status: 400 })
  }
  const message = (body.message ?? '').trim().slice(0, 500)
  if (!message) return NextResponse.json({ error: 'message required' }, { status: 400 })

  const clientHistory = Array.isArray(body.messages) ? body.messages.slice(-20) : []
  const pageName = body.page_context?.page_name ?? body.page_context?.route ?? ''
  const userContent = pageName ? '[On page: ' + pageName + ']\n' + message : message

  // Prior turns (exclude the current user message at the end of clientHistory)
  const priorHistory = clientHistory.slice(0, -1).map(m => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }))
  const allMessages = [...priorHistory, { role: 'user' as const, content: userContent }]

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: [{
        type: 'text',
        text: SYSTEM_PROMPT,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        cache_control: { type: 'ephemeral' } as any,
      }],
      messages: allMessages,
    })

    const reply = response.content[0]?.type === 'text' ? response.content[0].text : ''
    return NextResponse.json({ reply })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
