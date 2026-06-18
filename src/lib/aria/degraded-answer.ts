// API-RESILIENCE-1 — graceful degradation for the main brain.
//
// When the Anthropic tool-loop fails (down/overloaded) the main brain CANNOT run new live POS
// queries through a backup provider (OpenAI/Gemini don't share the tool-calling loop — that's the
// separate API-RESILIENCE-2 epic). But the ground-truth context was ALREADY assembled into the
// system prompt BEFORE the tool-loop ran — real, current figures. So a no-tools provider can still
// give a genuinely useful, grounded answer from that snapshot. It just can't fetch anything NEW.
//
// GROUNDING-TEETH: the fallback answers ONLY from the supplied ground truth; the prompt forbids
// inventing figures and tells it to say plainly when a number isn't in the snapshot.
import { ariaChatWithProvider } from '@/lib/ai-router'

const DEGRADE_PREAMBLE =
  'IMPORTANT: Aria\'s live data tools are temporarily unavailable, so you cannot run any new lookups. ' +
  'Answer the owner\'s question using ONLY the business data already provided below. ' +
  'Never invent or estimate a number — if a specific figure the owner asks for is not in the data below, ' +
  'say plainly that you can\'t retrieve that exact figure right now and answer with what IS available. ' +
  'Be concise, specific, and cite the real numbers from the data.'

export async function degradedGroundedAnswer(args: {
  groundTruth: string
  message: string
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
  maxTokens?: number
  /** true when the Anthropic circuit is OPEN — skip claude+haiku, go straight to gemini/openai. */
  skipAnthropic?: boolean
}): Promise<{ reply: string; provider: string }> {
  const historyText = (args.history ?? [])
    .slice(-6)
    .map(m => `${m.role}: ${typeof m.content === 'string' ? m.content : ''}`)
    .filter(Boolean)
    .join('\n')

  const prompt = [
    DEGRADE_PREAMBLE,
    'BUSINESS DATA (already assembled this session — these are the real, current figures):',
    (args.groundTruth ?? '').slice(0, 12000),
    historyText ? 'RECENT CONVERSATION:\n' + historyText : '',
    'OWNER QUESTION: ' + args.message,
  ].filter(Boolean).join('\n\n')

  const { text, provider } = await ariaChatWithProvider('chat', prompt, args.maxTokens ?? 1200, {
    skipAnthropic: args.skipAnthropic,
  })

  // If every provider failed, hand back an honest "all down" message (NOT a fabricated answer).
  if (!text || provider === 'none') {
    return {
      reply: 'Aria\'s AI providers are all briefly unavailable right now. Your data is safe — please try again in a few minutes.',
      provider: 'none',
    }
  }
  return { reply: text, provider }
}
