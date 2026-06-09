export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const MOOD_TAG_INSTRUCTION = `End every response with a mood tag and gesture tag on the same line:
- Good news / positive: [mood:happy][gesture:thumbup]
- Analysing / thinking: [mood:thinking][gesture:index]
- Problem / concern: [mood:concerned][gesture:shrug]
- Confirming action done: [mood:happy][gesture:ok]
- Greeting the user: [mood:happy][gesture:handup]
Do not include these tags in the spoken text — they are formatting instructions only.`

const SYSTEM_PROMPT = `You are Aria, a helpful assistant for café and retail staff. You answer questions about shifts, leave, messages, and daily operations. Keep responses under 3 sentences — warm, direct, and practical.

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
    page_context?: { route?: string; page_name?: string }
  }
  const message = (body.message ?? '').trim().slice(0, 500)
  if (!message) return NextResponse.json({ error: 'message required' }, { status: 400 })

  const pageName = body.page_context?.page_name ?? body.page_context?.route ?? ''
  const userContent = pageName ? '[On page: ' + pageName + ']\n' + message : message

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
      messages: [{ role: 'user', content: userContent }],
    })

    const reply = response.content[0]?.type === 'text' ? response.content[0].text : ''
    return NextResponse.json({ reply })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
