export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { createServerSupabaseClient } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';
import { ARIA_POS_TOOLS, executePOSTool } from '@/lib/aria-tools';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are Aria, the AI brain of an Australian retail business. You have read access to sales, inventory, customers, and suggestion tools for promotions. The owner is talking to you to understand their business or get help making decisions.

Style: confident, specific, Australian English (no z's), numbers always, no fluff. If a question is ambiguous, ask ONE clarifying question. If a query needs data, use tools proactively — don't ask permission.

When showing results: brief insight first (2-3 sentences), then data via generate_chart or table. End with one suggested next action.

Never invent numbers. If a tool returns no data, say so.`;

async function getBusinessId(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase
    .from('user_active_business')
    .select('business_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase
    .from('businesses')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const businessId = await getBusinessId(supabase, user.id);
  if (!businessId) {
    return new Response(JSON.stringify({ error: 'No active business' }), { status: 400 });
  }

  const { message, history, conversation_id } = await req.json() as {
    message: string;
    history?: { role: 'user' | 'assistant'; content: string }[];
    conversation_id?: string;
  };

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        const messages: MessageParam[] = [
          ...(history ?? []).map(h => ({ role: h.role, content: h.content } as MessageParam)),
          { role: 'user', content: message },
        ];

        let fullText = '';
        let continueLoop = true;

        while (continueLoop) {
          const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 4096,
            system: SYSTEM_PROMPT,
            tools: ARIA_POS_TOOLS,
            messages,
          });

          for (const block of response.content) {
            if (block.type === 'text') {
              fullText += block.text;
              send({ type: 'text', chunk: block.text });
            } else if (block.type === 'tool_use') {
              send({ type: 'tool_start', tool: block.name, id: block.id });
            }
          }

          if (response.stop_reason === 'tool_use') {
            const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
            messages.push({ role: 'assistant', content: response.content });

            const toolResults: MessageParam['content'] = [];

            for (const block of toolUseBlocks) {
              if (block.type !== 'tool_use') continue;
              try {
                const result = await executePOSTool(block.name, block.input, businessId);
                send({ type: 'tool_result', tool: block.name, id: block.id, result });
                toolResults.push({
                  type: 'tool_result',
                  tool_use_id: block.id,
                  content: JSON.stringify(result),
                });
              } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                send({ type: 'tool_error', tool: block.name, id: block.id, error: msg });
                toolResults.push({
                  type: 'tool_result',
                  tool_use_id: block.id,
                  content: `Error: ${msg}`,
                  is_error: true,
                });
              }
            }

            messages.push({ role: 'user', content: toolResults });
          } else {
            continueLoop = false;
          }
        }

        const title = message.slice(0, 80);
        const messagesJsonb = [
          ...(history ?? []).map(h => ({ role: h.role, content: h.content })),
          { role: 'user', content: message },
          { role: 'assistant', content: fullText },
        ];

        let convId = conversation_id;
        if (convId) {
          await supabase
            .from('aria_conversations')
            .update({ messages: messagesJsonb, title, updated_at: new Date().toISOString() })
            .eq('id', convId)
            .eq('business_id', businessId);
        } else {
          const { data: newConv } = await supabase
            .from('aria_conversations')
            .insert({ business_id: businessId, user_id: user.id, title, messages: messagesJsonb })
            .select('id')
            .single();
          convId = newConv?.id ?? null;
        }

        send({ type: 'done', conversation_id: convId });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        send({ type: 'error', message: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
