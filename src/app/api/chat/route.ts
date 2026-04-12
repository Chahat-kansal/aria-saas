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

  await connectDB();

  const user = await User.findById((session.user as any).id);
  if (!user) {
    return new Response(JSON.stringify({ error: 'User not found' }), {
      status: 404,
    });
  }

  // Reset monthly counter
  const now = new Date();
  if (now.getMonth() !== new Date(user.messagesResetAt).getMonth()) {
    user.messagesUsedThisMonth = 0;
    user.messagesResetAt = now;
  }

  const plan =
    PLAN_LIMITS[user.plan as keyof typeof PLAN_LIMITS] || PLAN_LIMITS.free;

  if (user.messagesUsedThisMonth >= plan.messages) {
    return new Response(
      JSON.stringify({
        error: 'Monthly message limit reached. Upgrade to Pro.',
      }),
      { status: 429 }
    );
  }

  const { message, conversationId, model, useWebSearch, system } =
    await req.json();

  if (!message?.trim()) {
    return new Response(JSON.stringify({ error: 'Message required' }), {
      status: 400,
    });
  }

  const safeModel =
    ALLOWED_MODELS.has(model) && plan.models.includes(model)
      ? model
      : 'claude-haiku-4-5-20251001';

  const canSearch = plan.webSearch && useWebSearch;

  // Load or create conversation
  let conversation = conversationId
    ? await Conversation.findOne({
        _id: conversationId,
        userId: user._id,
      })
    : null;

  if (!conversation) {
    conversation = await Conversation.create({
      userId: user._id,
      title: message.slice(0, 60),
      messages: [],
      model: safeModel,
    });
  }

  conversation.messages.push({
    role: 'user',
    content: message,
    createdAt: new Date(),
  });

  const history = conversation.messages.slice(-40).map((m: any) => ({
    role: m.role,
    content: m.content,
  }));

  const systemPrompt =
    system?.trim() ||
    'You are Aria, a helpful AI assistant. Be concise and accurate.';

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let fullReply = '';

      try {
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

        // Save assistant message
        conversation.messages.push({
          role: 'assistant',
          content: fullReply,
          createdAt: new Date(),
        });

        await conversation.save();

        user.messagesUsedThisMonth += 1;
        await user.save();

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              done: true,
              conversationId: conversation._id.toString(),
            })}\n\n`
          )
        );
      } catch (err: any) {
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

  // ✅ IMPORTANT: return STREAM ONLY (no JSON return!)
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
