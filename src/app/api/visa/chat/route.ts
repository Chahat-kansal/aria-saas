import { createServerSupabaseClient } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';
import { withErrorCapture } from '@/lib/api/with-error-capture'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return new Response('Unauthorized', { status: 401 });

  const { messages } = await req.json();
  const agentId = user.id;
  const today = new Date().toISOString().split('T')[0];

  const [{ count: clientCount }, { data: recentAlerts }] = await Promise.all([
    supabase.from('visa_clients').select('*', { count: 'exact', head: true }).eq('agent_id', agentId),
    supabase.from('immigration_alerts').select('title,severity').eq('agent_id', agentId).eq('is_read', false).limit(5),
  ]);

  const alertContext = recentAlerts?.length
    ? `\n\nCurrent unread alerts for this agent:\n${recentAlerts.map((a: any) => `- [${a.severity.toUpperCase()}] ${a.title}`).join('\n')}`
    : '';

  const systemPrompt = `You are VisaAI, an expert Australian migration assistant. You have deep knowledge of:
- All Australian visa subclasses (189, 190, 491, 482, 186, 500, 820/801, 309/100, 417, 462 and all others)
- The Migration Act 1958 and Migration Regulations 1994
- MARA (Migration Agents Registration Authority) requirements and Code of Conduct
- Current Department of Home Affairs policy and processing times
- Points test calculations, skills assessments, and English requirements
- Bridging visas, character requirements, and health requirements
- Partner visas, family visas, and student visas

You help registered migration agents manage their clients, understand policy changes, draft correspondence, and ensure compliance.

Always recommend clients seek advice from a MARA-registered agent for official decisions. Be precise, professional, and cite relevant legislation or policy where helpful.

Current date: ${today}
This agent has ${clientCount || 0} active clients.${alertContext}`;

  const stream = anthropic.messages.stream({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 2048,
    system: systemPrompt,
    messages: messages.map((m: any) => ({ role: m.role, content: m.content })),
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: { text: event.delta.text } })}\n\n`));
          }
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
  });
}

export const POST = withErrorCapture('visa/chat', _POST)
