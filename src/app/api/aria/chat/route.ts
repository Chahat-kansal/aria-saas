import { createServerSupabaseClient } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';
import { ARIA_TOOLS, runAriaTool } from '@/lib/claudeTools';
import { browserClose } from '@/lib/browser';

export const maxDuration = 120;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  const { messages, businessId } = await req.json();
  if (!messages?.length || !businessId) {
    return new Response(JSON.stringify({ error: 'messages and businessId required' }), { status: 400 });
  }

  // Verify ownership
  const { data: business } = await supabase
    .from('businesses')
    .select('*')
    .eq('id', businessId)
    .eq('user_id', session.user.id)
    .single();

  if (!business) return new Response(JSON.stringify({ error: 'Business not found' }), { status: 404 });

  const systemPrompt = `You are Aria, an AI business assistant for ${business.name}, a ${business.industry || 'local'} business${business.city ? ` in ${business.city}` : ''} on the ${business.plan} plan.

Owner: ${business.owner_name || 'the owner'}
Industry: ${business.industry || 'general business'}
Staff: ${business.staff_count || 'unknown'}
Monthly revenue: ${business.monthly_revenue || 'unknown'}
Google rating: ${business.google_rating || 'not tracked'}
Biggest challenge: ${business.biggest_challenge || 'not specified'}

Your job is to give specific, actionable advice to help this business make more money, retain customers, and run more efficiently. Be direct, confident, and specific to their industry. Reference their actual data when relevant.

You also have live internet access — use it when the owner asks about competitors, trends, or anything time-sensitive.`;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      const openedSessions = new Set<string>();
      let fullReply = '';

      try {
        // Save user message
        const lastUserMsg = messages[messages.length - 1];
        if (lastUserMsg?.role === 'user') {
          await supabase.from('aria_conversations').insert({
            business_id: businessId,
            role: 'user',
            content: lastUserMsg.content,
          });
        }

        const tools: any[] = [
          { type: 'web_search_20250305' as const, name: 'web_search' },
          ...ARIA_TOOLS.filter(t => !('type' in t) || t.type !== 'web_search_20250305'),
        ];

        let loopMessages = messages.map((m: { role: string; content: string }) => ({
          role: m.role,
          content: m.content,
        }));

        for (let step = 0; step < 8; step++) {
          const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-5-20250929',
            max_tokens: 4096,
            system: systemPrompt,
            messages: loopMessages,
            tools,
          } as any);

          const content = response.content || [];
          loopMessages.push({ role: 'assistant', content });

          let usedTool = false;
          for (const block of content) {
            if (block.type === 'text') {
              fullReply += block.text;
              send({ text: block.text });
            }
            if (block.type === 'tool_use') {
              usedTool = true;
              try {
                const result = await runAriaTool(block.name, block.input || {});
                if (result && typeof result === 'object' && 'sessionId' in result) {
                  openedSessions.add((result as any).sessionId);
                }
                loopMessages.push({
                  role: 'user',
                  content: [{ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) }],
                });
                send({ tool: block.name, toolResult: result });
              } catch (err: any) {
                loopMessages.push({
                  role: 'user',
                  content: [{ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify({ error: err.message }) }],
                });
              }
            }
          }
          if (!usedTool) break;
        }

        // Save assistant reply
        if (fullReply) {
          await supabase.from('aria_conversations').insert({
            business_id: businessId,
            role: 'assistant',
            content: fullReply,
          });
        }

        for (const sid of openedSessions) await browserClose(sid).catch(() => {});
        send({ done: true });
      } catch (err: any) {
        send({ error: err.message || 'Something went wrong' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  });
}
