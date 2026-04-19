import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/mongodb';
import { User } from '@/models/User';
import { Conversation } from '@/models/Conversation';
import Anthropic from '@anthropic-ai/sdk';
import { ARIA_SYSTEM, ARIA_TOOLS, runAriaTool } from '@/lib/claudeTools';
import { browserClose } from '@/lib/browser';

export const maxDuration = 120;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ALLOWED_MODELS = new Set([
  'claude-haiku-4-5-20251001',
  'claude-sonnet-4-5-20250929',
  'claude-opus-4-5-20251101',
]);

const PLAN_LIMITS = {
  free: { messages: 50, models: ['claude-haiku-4-5-20251001'], webSearch: false, tools: false },
  pro: {
    messages: Infinity,
    models: ['claude-haiku-4-5-20251001', 'claude-sonnet-4-5-20250929', 'claude-opus-4-5-20251101'],
    webSearch: true,
    tools: true,
  },
};

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const { message, conversationId, model, useWebSearch, enableWebSearch, enablePlugins, system } = body;
  if (!message?.trim()) {
    return new Response(JSON.stringify({ error: 'Message required' }), { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const openedSessions = new Set<string>();

      try {
        await connectDB();

        const [user, conversation] = await Promise.all([
          User.findById((session.user as any).id),
          conversationId ? Conversation.findOne({ _id: conversationId, userId: (session.user as any).id }) : null,
        ]);

        if (!user) {
          send({ error: 'User not found' });
          controller.close();
          return;
        }

        const now = new Date();
        if (now.getMonth() !== new Date(user.messagesResetAt).getMonth()) {
          user.messagesUsedThisMonth = 0;
          user.messagesResetAt = now;
        }

        const plan = PLAN_LIMITS[user.plan as keyof typeof PLAN_LIMITS] || PLAN_LIMITS.free;
        if (user.messagesUsedThisMonth >= plan.messages) {
          send({ error: 'Monthly message limit reached. Upgrade to Pro.' });
          controller.close();
          return;
        }

        const safeModel =
          ALLOWED_MODELS.has(model) && plan.models.includes(model)
            ? model
            : 'claude-haiku-4-5-20251001';

        //const canSearch = plan.webSearch && (useWebSearch || enableWebSearch);
        const canSearch = true;
        const canUseTools = true;
        //const canUseTools = plan.tools && !!enablePlugins;

        let activeConv = conversation;
        if (!activeConv) {
          activeConv = await Conversation.create({
            userId: user._id,
            title: message.slice(0, 60),
            messages: [],
            model: safeModel,
          });
        }

        activeConv.messages.push({
          role: 'user',
          content: message,
          createdAt: new Date(),
        });

        const history = activeConv.messages
          .slice(-20)
          .map((m: any) => ({ role: m.role, content: m.content }));

        const systemPrompt = [user.customPersona || '', user.systemPrompt || '', system?.trim() || ARIA_SYSTEM]
          .filter(Boolean)
          .join('\n\n');

        const tools: any[] = [];
        if (canSearch) {
          tools.push({ type: 'web_search_20250305', name: 'web_search' });
        }
        if (canUseTools) {
  for (const tool of ARIA_TOOLS) {
    if (!('type' in tool) || tool.type !== 'web_search_20250305') {
      tools.push(tool);
    }
  }
}

        let loopMessages: any[] = [...history];
        let fullReply = '';

        for (let step = 0; step < 8; step++) {
          console.log('TOOLS SENT:', JSON.stringify(tools, null, 2));
          console.log('SYSTEM PROMPT:', systemPrompt);
          console.log('LAST USER MESSAGE:', message);
          const response = await anthropic.messages.create({
            model: safeModel,
            max_tokens: 4096,
            system: systemPrompt,
            messages: loopMessages,
            ...(tools.length ? { tools } : {}),
          } as any);

          const assistantContent = response.content || [];
          console.log('ASSISTANT CONTENT:', JSON.stringify(assistantContent, null, 2));
          loopMessages.push({
            role: 'assistant',
            content: assistantContent,
          });

          let usedTool = false;

          for (const block of assistantContent) {
            if (block.type === 'text') {
              fullReply += block.text;
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
            break;
          }
        }

        activeConv.messages.push({
          role: 'assistant',
          content: fullReply,
          createdAt: new Date(),
        });

        user.messagesUsedThisMonth += 1;

        await Promise.all([
          activeConv.save().catch(console.error),
          user.save().catch(console.error),
        ]);

        for (const sessionId of openedSessions) {
          await browserClose(sessionId).catch(() => {});
        }

        send({
          done: true,
          conversationId: activeConv._id.toString(),
        });
      } catch (err: any) {
        console.error('Chat error:', err);
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
