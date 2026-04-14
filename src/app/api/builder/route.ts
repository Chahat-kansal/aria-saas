import crypto from 'node:crypto';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/mongodb';
import { User } from '@/models/User';
import { Conversation } from '@/models/Conversation';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const BUILDER_SYSTEM = `You are Aria Builder — an expert full-stack developer and UI/UX designer.

When asked to build websites, apps, components, or any code project, you:
1. Write COMPLETE, fully functional code — never placeholders or TODOs
2. Use modern best practices (React hooks, Tailwind CSS, clean TypeScript)
3. Make UIs beautiful — proper spacing, colors, typography, hover states
4. Always wrap code in proper markdown fences with the language tag: \`\`\`html, \`\`\`jsx, \`\`\`tsx etc.
5. Explain what you built AFTER the code, briefly

For websites/landing pages: output a single \`\`\`html file with inline CSS and JS
For React components: output \`\`\`jsx or \`\`\`tsx with Tailwind classes
For multi-file projects: output each file separately with clear headings

Design principles:
- Clean, modern aesthetic — generous whitespace, clear hierarchy
- Dark themes look great — use them when appropriate
- Responsive by default
- Accessible — proper ARIA labels, semantic HTML
- Functional — working buttons, forms, navigation

When the user asks to modify or iterate on something, always output the FULL updated code.`;

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  await connectDB();
  const user = await User.findById((session.user as any).id);
  if (!user) return new Response(JSON.stringify({ error: 'User not found' }), { status: 404 });

  const now = new Date();
  if (now.getMonth() !== new Date(user.messagesResetAt).getMonth()) {
    user.messagesUsedThisMonth = 0;
    user.messagesResetAt = now;
  }

  const freeLimitReached = user.plan === 'free' && user.messagesUsedThisMonth >= 50;
  if (freeLimitReached) {
    return new Response(JSON.stringify({ error: 'Monthly message limit reached. Upgrade to Pro.' }), { status: 429 });
  }

  const { message, conversationId, model } = await req.json();
  if (!message?.trim()) return new Response(JSON.stringify({ error: 'Message required' }), { status: 400 });

  const safeModel = ['claude-haiku-4-5-20251001', 'claude-sonnet-4-20250514', 'claude-opus-4-20250514'].includes(model)
    ? model : 'claude-sonnet-4-20250514'; // Builder defaults to Sonnet for quality

  let conversation = conversationId
    ? await Conversation.findOne({ _id: conversationId, userId: user._id })
    : null;

  if (!conversation) {
    conversation = await Conversation.create({
      userId: user._id,
      title: `🔨 ${message.slice(0, 55)}`,
      messages: [],
      model: safeModel,
    });
  }

  conversation.messages.push({ role: 'user', content: message, createdAt: new Date() });

  const history = conversation.messages.slice(-20).map((m: any) => ({
    role: m.role,
    content: m.content,
  }));

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let fullReply = '';
      try {
        const claudeStream = await anthropic.messages.stream({
          model: safeModel,
          max_tokens: 8192, // More tokens for complete code
          system: BUILDER_SYSTEM,
          messages: history,
        });

        for await (const chunk of claudeStream) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            fullReply += chunk.delta.text;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`));
          }
        }

        conversation.messages.push({ role: 'assistant', content: fullReply, createdAt: new Date() });
        await conversation.save();
        user.messagesUsedThisMonth += 1;
        await user.save();

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, conversationId: conversation._id.toString() })}\n\n`));
      } catch (err: any) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: err.message })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
  });
}
