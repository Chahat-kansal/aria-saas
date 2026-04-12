import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/mongodb';
import { User } from '@/models/User';
import { Conversation } from '@/models/Conversation';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const ALLOWED_MODELS = new Set([
  'claude-haiku-4-5-20251001',
  'claude-sonnet-4-20250514',
  'claude-opus-4-20250514',
]);

const PLAN_LIMITS = {
  free: {
    messages: 50,
    models: ['claude-haiku-4-5-20251001'],
    webSearch: false,
  },
  pro: {
    messages: Infinity,
    models: [
      'claude-haiku-4-5-20251001',
      'claude-sonnet-4-20250514',
      'claude-opus-4-20250514',
    ],
    webSearch: true,
  },
};

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
    });
  }

  // ✅ Parse body early
  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
    });
  }

  const { message, conversationId, model, useWebSearch, system } = body;

  if (!message?.trim()) {
    return new Response(JSON.stringify({ error: 'Message required' }), {
      status: 400,
    });
  }

  // ✅ Start streaming immediately with worker pattern
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // ✅ OPTIMIZATION: Parallel DB operations
        await connectDB();
        
        const [user, conversation] = await Promise.all([
          User.findById((session.user as any).id),
          conversationId
            ? Conversation.findOne({
                _id: conversationId,
                userId: (session.user as any).id,
              })
            : Promise.resolve(null),
        ]);

        if (!user) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: 'User not found' })}\n\n`
            )
          );
          controller.close();
          return;
        }

        // Reset monthly counter
        const now = new Date();
        if (now.getMonth() !== new Date(user.messagesResetAt).getMonth()) {
          user.messagesUsedThisMonth = 0;
          user.messagesResetAt = now;
        }

        const plan =
          PLAN_LIMITS[user.plan as keyof typeof PLAN_LIMITS] ||
          PLAN_LIMITS.free;

        if (user.messagesUsedThisMonth >= plan.messages) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                error: 'Monthly message limit reached. Upgrade to Pro.',
              })}\n\n`
            )
          );
          controller.close();
          return;
        }

        const safeModel =
          ALLOWED_MODELS.has(model) && plan.models.includes(model)
            ? model
            : 'claude-haiku-4-5-20251001';

        const canSearch = plan.webSearch && useWebSearch;

        // Create or use existing conversation
        let activeConversation = conversation;
        if (!activeConversation) {
          activeConversation = await Conversation.create({
            userId: user._id,
            title: message.slice(0, 60),
            messages: [],
            model: safeModel,
          });
        }

        activeConversation.messages.push({
          role: 'user',
          content: message,
          createdAt: new Date(),
        });

        const history = activeConversation.messages.slice(-40).map((m: any) => ({
          role: m.role,
          content: m.content,
        }));

        const systemPrompt =
          system?.trim() ||
          'You are Aria, a helpful AI assistant. Be concise and accurate.';

        let fullReply = '';

        const tools = canSearch
          ? [{ type: 'web_search_20250305' as const, name: 'web_search' }]
          : undefined;

        const claudeStream = await anthropic.messages.stream({
          model: safeModel,
          max_tokens: 4096,
          system: systemPrompt,
          messages: history,
          ...(tools ? { tools } : {}),
        } as any);

        for await (const chunk of claudeStream) {
          if (
            chunk.type === 'content_block_delta' &&
            chunk.delta.type === 'text_delta'
          ) {
            fullReply += chunk.delta.text;

            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`
              )
            );
          }
        }

        // ✅ OPTIMIZATION: Save in background (fire and forget)
        activeConversation.messages.push({
          role: 'assistant',
          content: fullReply,
          createdAt: new Date(),
        });

        user.messagesUsedThisMonth += 1;

        // Don't await - let it save in background
        activeConversation.save().catch(err => {
          console.error('Failed to save conversation:', err);
        });
        user.save().catch(err => {
          console.error('Failed to save user:', err);
        });

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              done: true,
              conversationId: activeConversation._id.toString(),
            })}\n\n`
          )
        );
      } catch (err: any) {
        console.error('Chat error:', err);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ error: err.message })}\n\n`
          )
        );
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
