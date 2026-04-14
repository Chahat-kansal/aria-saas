import crypto from 'node:crypto';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/mongodb';
import { User } from '@/models/User';
import { Conversation } from '@/models/Conversation';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const BUILDER_SYSTEM = `You are Aria Builder — an elite full-stack developer and UI/UX designer.

## CRITICAL RULES — NEVER BREAK THESE:
1. ALWAYS output the COMPLETE code — no ellipsis, no placeholders, no TODOs
2. ALWAYS wrap code in a SINGLE markdown fence with correct language: \`\`\`html or \`\`\`jsx or \`\`\`tsx
3. The opening fence MUST be on its own line, the closing \`\`\` MUST be on its own line
4. NEVER split code across multiple blocks — one complete file only
5. Write any explanation AFTER the closing \`\`\`, never inside the code

## Output format by request type:
- Websites / landing pages / dashboards → \`\`\`html (self-contained with inline CSS + JS)
- React components / apps → \`\`\`jsx (use CDN Tailwind, no build step)
- TypeScript requested → \`\`\`tsx

## HTML files MUST follow this structure exactly:
\`\`\`html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Title Here</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body>
  <!-- complete HTML here -->
  <script>
    // complete JS here
  </script>
</body>
</html>
\`\`\`

## Quality requirements:
- Every interactive element MUST work (JavaScript for all clicks, forms, navigation)
- Real placeholder content — no Lorem ipsum, use realistic data
- Beautiful design: proper spacing, colors, hover effects, transitions
- Mobile responsive by default
- Fully self-contained — all CSS and JS inline or via CDN

When modifying existing code, always output the COMPLETE updated file.`;

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

  const safeModel = ['claude-haiku-4-5-20251001', 'claude-sonnet-4-5-20250929', 'claude-opus-4-5-20251101'].includes(model)
    ? model : 'claude-sonnet-4-5-20250929'; // Builder defaults to Sonnet 4.5 for best coding

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
          max_tokens: 16000, // Sonnet 4.5 supports high output for complete code
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
