import { createServerSupabaseClient } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';
import { ARIA_SYSTEM, ARIA_TOOLS, runAriaTool } from '@/lib/claudeTools';
import { browserClose } from '@/lib/browser';

export const maxDuration = 120;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const { message, model } = body;
  if (!message?.trim()) {
    return new Response(JSON.stringify({ error: 'Message required' }), { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      const openedSessions = new Set<string>();

      try {
        let loopMessages: any[] = [
          {
            role: 'user',
            content: message,
          },
        ];

        const safeModel =
          model &&
          [
            'claude-haiku-4-5-20251001',
            'claude-sonnet-4-5-20250929',
            'claude-opus-4-5-20251101',
          ].includes(model)
            ? model
            : 'claude-sonnet-4-5-20250929';

        for (let step = 0; step < 8; step++) {
          const response = await anthropic.messages.create({
            model: safeModel,
            max_tokens: 4096,
            system: ARIA_SYSTEM,
            messages: loopMessages,
            tools: ARIA_TOOLS as any,
          } as any);

          const assistantContent = response.content || [];

          loopMessages.push({
            role: 'assistant',
            content: assistantContent,
          });

          let usedTool = false;

          for (const block of assistantContent) {
            if (block.type === 'text') {
              send({ text: block.text });
            }

            if (block.type === 'tool_use') {
              usedTool = true;

              try {
                const result = await runAriaTool(block.name, block.input || {});

                if (result && typeof result === 'object' && 'sessionId' in result && (result as any).sessionId) {
                  openedSessions.add((result as any).sessionId);
                }

                loopMessages.push({
                  role: 'user',
                  content: [
                    {
                      type: 'tool_result',
                      tool_use_id: block.id,
                      content: JSON.stringify(result),
                    },
                  ],
                });

                send({
                  tool: block.name,
                  toolResult: result,
                });
              } catch (toolErr: any) {
                loopMessages.push({
                  role: 'user',
                  content: [
                    {
                      type: 'tool_result',
                      tool_use_id: block.id,
                      content: JSON.stringify({
                        error: toolErr.message || 'Tool failed',
                      }),
                    },
                  ],
                });

                send({
                  tool: block.name,
                  error: toolErr.message || 'Tool failed',
                });
              }
            }
          }

          if (!usedTool) {
            send({ done: true });
            break;
          }
        }

        for (const sessionId of openedSessions) {
          await browserClose(sessionId).catch(() => {});
        }
      } catch (err: any) {
        console.error('Research route error:', err);
        send({ error: err.message || 'Something went wrong' });
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
