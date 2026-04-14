import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/mongodb';
import { User } from '@/models/User';
import { Conversation } from '@/models/Conversation';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 60; // Allow 60s for Claude streaming


const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const BUILDER_SYSTEM = `You are Aria Builder — an elite full-stack developer and UI/UX designer with 20 years of experience building production web applications.

## YOUR OUTPUT FORMAT — FOLLOW EXACTLY:

For every build request, output ONE complete code block then a brief explanation:

\`\`\`html
[complete code here]
\`\`\`

**What I built:** [1-2 sentence explanation]

## CRITICAL RULES:
1. ONE code block only — never split across multiple blocks
2. Code must be 100% complete — no "...", no "// rest here", no placeholders, no TODOs
3. The \`\`\`html (or \`\`\`jsx) opening tag must be on its own line
4. The closing \`\`\` must be on its own line after all the code
5. Explanation goes AFTER the closing \`\`\`, never before or inside

## WHAT TO OUTPUT:
- Websites, landing pages, dashboards, forms → \`\`\`html (single self-contained file)
- React components, apps → \`\`\`jsx (CDN-based, no build step)
- When user asks for TypeScript → \`\`\`tsx

## HTML TEMPLATE (use this structure every time):
\`\`\`html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>[Descriptive Title]</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    /* Custom styles here if needed */
  </style>
</head>
<body class="bg-gray-950 text-white min-h-screen">
  <!-- All HTML here -->

  <script>
    // All JavaScript here — make everything interactive and working
  </script>
</body>
</html>
\`\`\`

## DESIGN STANDARDS — every build must have:
- **Real content**: Use realistic data, real company names, real-looking numbers — never "Lorem ipsum" or "Sample text"
- **Working interactions**: Every button clicks, every form validates, every tab switches, every modal opens/closes
- **Beautiful visuals**: Gradients, shadows, smooth hover transitions (transition-all duration-200), proper spacing
- **Dark mode by default**: Dark backgrounds look professional and premium
- **Mobile responsive**: Works on all screen sizes using Tailwind responsive prefixes
- **Professional polish**: The result should look like it cost $5,000 to build

## WHEN MODIFYING CODE:
Always output the complete updated file — never partial updates or diffs.`;

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  await connectDB();
  const user = await User.findById((session.user as any).id);
  if (!user) return new Response(JSON.stringify({ error: 'User not found' }), { status: 404 });

  const now = new Date();
  if (now.getMonth() !== new Date(user.messagesResetAt).getMonth()) {
    user.messagesUsedThisMonth = 0; user.messagesResetAt = now;
  }

  if (user.plan === 'free' && user.messagesUsedThisMonth >= 50) {
    return new Response(JSON.stringify({ error: 'Monthly message limit reached. Upgrade to Pro.' }), { status: 429 });
  }

  const { message, conversationId, model } = await req.json();
  if (!message?.trim()) return new Response(JSON.stringify({ error: 'Message required' }), { status: 400 });

  // Builder always uses Sonnet 4.5 minimum — best coding model
  const safeModel = model === 'claude-opus-4-5-20251101' ? model : 'claude-sonnet-4-5-20250929';

  let conversation = conversationId ? await Conversation.findOne({ _id: conversationId, userId: user._id }) : null;
  if (!conversation) {
    conversation = await Conversation.create({ userId: user._id, title: `🔨 ${message.slice(0, 55)}`, messages: [], model: safeModel });
  }
  conversation.messages.push({ role: 'user', content: message, createdAt: new Date() });

  const history = conversation.messages.slice(-20).map((m: any) => ({ role: m.role, content: m.content }));

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      let fullReply = '';
      try {
        const claudeStream = await anthropic.messages.stream({
          model: safeModel,
          max_tokens: 16000,
          system: BUILDER_SYSTEM,
          messages: history,
        });

        for await (const chunk of claudeStream) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            fullReply += chunk.delta.text;
            send({ text: chunk.delta.text });
          }
        }

        conversation.messages.push({ role: 'assistant', content: fullReply, createdAt: new Date() });
        user.messagesUsedThisMonth += 1;
        conversation.save().catch(console.error);
        user.save().catch(console.error);

        send({ done: true, conversationId: conversation._id.toString() });
      } catch (err: any) {
        console.error('Builder error:', err);
        send({ error: err.message || 'Build failed' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' } });
}
