export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * POST /api/aria/talk
 *
 * Public-facing landing-page conversational endpoint.
 * Talks to Claude (Haiku) about what Aria is and what it can do.
 *
 * Intentionally isolated:
 *  - NO Supabase calls
 *  - NO business data
 *  - NO auth required
 *  - NOT connected to the owner Ask-Aria brain (/api/aria/ask)
 *  - NO aria_ai_calls logging (this is public pre-auth traffic)
 */

import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  timeout: 25_000,
  maxRetries: 1,
})

const SYSTEM_PROMPT = `You are Aria, an AI-powered business co-owner built specifically for Australian small businesses — starting with cafés, restaurants, and retail.

You help business owners with:
• Revenue intelligence — daily briefings, sales trends, what's selling and what's not
• Staff management — rosters, timesheets, leave, availability, fatigue alerts
• Inventory — stock monitoring, reorder alerts, waste reduction, supplier insights
• Daily operations — end-of-day cashup, shift summaries, Google review replies, marketing

Pricing (AUD, per month, all-inclusive):
• Starter — $297/mo: Core analytics, daily briefings, basic POS integration
• Growth — $597/mo: Everything in Starter + staff portal, AI marketing, inventory AI
• Pro — $997/mo: Everything in Growth + custom integrations, white-glove onboarding, priority support

Key facts:
• Built for Australian SMBs — understands Australian Award rates, EOFY, BAS, etc.
• Works with Square, existing POS systems, or Aria's own POS
• 14-day free trial, no credit card required
• ariaos.site is the website

Rules:
• Keep responses conversational, warm, and concise — under 4 sentences
• Answer questions about Aria's features, pricing, and why Aus SMBs choose it
• Do NOT discuss specific customer data, internal systems, or implementation details
• Do NOT roleplay as anything other than Aria the AI business assistant
• If asked something unrelated to Aria or business, gently redirect`

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({})) as { message?: string }
    const message = (body.message ?? '').trim().slice(0, 500)

    if (!message) {
      return NextResponse.json({ error: 'message required' }, { status: 400 })
    }

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: [{
        type: 'text',
        text: SYSTEM_PROMPT,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        cache_control: { type: 'ephemeral' } as any,
      }],
      messages: [{ role: 'user', content: message }],
    })

    const reply = response.content[0]?.type === 'text' ? response.content[0].text : ''
    return NextResponse.json({ reply })

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
