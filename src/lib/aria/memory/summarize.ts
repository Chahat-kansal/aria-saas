import { supabaseAdmin } from '@/lib/supabase-admin'
import Anthropic from '@anthropic-ai/sdk'

interface ConversationMessage {
  role: string
  content: string
}

interface SummarizationResult {
  summary: string
  key_decisions: string[]
  key_concerns: string[]
  followup_promised: string[]
}

const SUMMARIZER_SYSTEM = `You extract a concise structured summary from an Aria OS business conversation.

Return ONLY valid JSON (no code fences, no preamble):
{
  "summary": "2-3 sentences covering what was discussed and any key insights",
  "key_decisions": ["explicit decision the owner made or confirmed", "..."],
  "key_concerns": ["ongoing worry raised by the owner", "..."],
  "followup_promised": ["something Aria said it would check or the owner asked to revisit", "..."]
}

Rules:
- summary: 2-3 sentences max. Plain English. Specific to this conversation.
- key_decisions: only if the owner made an explicit choice. Max 3. Empty array if none.
- key_concerns: only recurring or significant worries. Max 3. Empty array if none.
- followup_promised: only if Aria or the owner mentioned checking something later. Max 3.
- Never invent content not in the conversation.
- If nothing notable happened, return summary only with empty arrays for the rest.`

export async function summariseConversation(
  businessId: string,
  messages: ConversationMessage[],
  conversationId: string,
): Promise<void> {
  if (!messages || messages.length < 4) return

  const transcript = messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .slice(-20) // last 20 messages to stay within token budget
    .map(m => (m.role === 'user' ? 'Owner: ' : 'Aria: ') + (m.content ?? '').slice(0, 600))
    .join('\n')

  if (transcript.split(' ').length < 40) return

  try {
    const { callOpenAI } = await import('../providers/openai')
    let rawText = ''

    const openaiResult = await callOpenAI({
      systemPrompt: SUMMARIZER_SYSTEM,
      userPrompt: transcript,
      maxTokens: 400,
      businessId,
      agentKey: 'conversation_summarizer',
      role: 'classify',
    })

    if (openaiResult.success && openaiResult.raw) {
      rawText = openaiResult.raw
    } else {
      // OpenAI unavailable or failed — fall back to Anthropic
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      const resp = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system: SUMMARIZER_SYSTEM,
        messages: [{ role: 'user', content: transcript }],
      })
      rawText = (resp.content[0] as { type: string; text: string }).text ?? ''
    }

    const cleaned = rawText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/, '')
      .trim()

    const parsed: SummarizationResult = JSON.parse(cleaned)
    if (!parsed?.summary) return

    const today = new Date().toISOString().slice(0, 10)
    await supabaseAdmin.from('aria_conversation_summaries').upsert({
      business_id: businessId,
      conversation_date: today,
      mode: 'ask_aria',
      summary: parsed.summary.slice(0, 500),
      key_decisions: Array.isArray(parsed.key_decisions) ? parsed.key_decisions.slice(0, 3) : [],
      key_concerns: Array.isArray(parsed.key_concerns) ? parsed.key_concerns.slice(0, 3) : [],
      followup_promised: Array.isArray(parsed.followup_promised) ? parsed.followup_promised.slice(0, 3) : [],
    }, { onConflict: 'business_id,conversation_date,mode' })
  } catch (e) { console.error('[aria/summarise] conversation summarization failed (non-fatal):', (e as Error).message) }
}
