import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/mongodb';
import { User } from '@/models/User';
import { Conversation } from '@/models/Conversation';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 120; // Allow 120s for Claude streaming


const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ARIA_SYSTEM = `You are Aria — a brilliant, friendly AI assistant built for real work.

You excel at:
- Writing, editing, and proofreading
- Coding in any language — you write clean, complete, working code
- Analysis, research, and problem-solving
- Brainstorming and creative tasks
- Explaining complex topics simply

Coding guidelines:
- Always write complete, working code — never truncate or use placeholders
- Include comments for complex logic
- Follow best practices for the language/framework
- If asked to fix code, explain what was wrong and what you fixed
- For HTML/CSS/JS, write self-contained files that work immediately

Response style:
- Be direct and concise — get to the point
- Use markdown formatting for clarity (code blocks, headers, lists)
- Match the user's tone — casual or formal
- If something is unclear, make a reasonable assumption and proceed rather than asking`;

const ALLOWED_MODELS = new Set([
  'claude-haiku-4-5-20251001',
  'claude-sonnet-4-5-20250929',
  'claude-opus-4-5-20251101',
]);

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 }); }

  const { message, conversationId, model, enableWebSearch, enablePlugins, system } = body;
  if (!message?.trim()) return new Response(JSON.stringify({ error: 'Message required' }), { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      try {
        await connectDB();

        const [user, conversation] = await Promise.all([
          User.findById((session.user as any).id),
          conversationId ? Conversation.findOne({ _id: conversationId, userId: (session.user as any).id }) : null,
        ]);

        if (!user) { send({ error: 'User not found' }); controller.close(); return; }

        const now = new Date();
        if (now.getMonth() !== new Date(user.messagesResetAt).getMonth()) {
          user.messagesUsedThisMonth = 0; user.messagesResetAt = now;
        }

        if (user.plan === 'free' && user.messagesUsedThisMonth >= 50) {
          send({ error: 'Monthly limit reached. Upgrade to Pro.' }); controller.close(); return;
        }

        const planModels = user.plan === 'pro'
          ? ['claude-haiku-4-5-20251001','claude-sonnet-4-5-20250929','claude-opus-4-5-20251101']
          : ['claude-haiku-4-5-20251001'];
        const safeModel = ALLOWED_MODELS.has(model) && planModels.includes(model) ? model : 'claude-haiku-4-5-20251001';
        const canSearch = user.plan === 'pro' && enableWebSearch;

        let activeConv = conversation;
        if (!activeConv) {
          activeConv = await Conversation.create({ userId: user._id, title: message.slice(0, 60), messages: [], model: safeModel });
        }
        activeConv.messages.push({ role: 'user', content: message, createdAt: new Date() });

        const history = activeConv.messages.slice(-40).map((m: any) => ({ role: m.role, content: m.content }));

        const systemPrompt = [
          user.customPersona || '',
          user.systemPrompt || '',
          system?.trim() || ARIA_SYSTEM,
        ].filter(Boolean).join('\n\n');

        const tools = canSearch ? [{ type: 'web_search_20250305' as const, name: 'web_search' }] : undefined;

        let fullReply = '';
        const claudeStream = await anthropic.messages.stream({
          model: safeModel,
          max_tokens: 8096,
          system: systemPrompt,
          messages: history,
          ...(tools ? { tools } : {}),
        } as any);

        for await (const chunk of claudeStream) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            fullReply += chunk.delta.text;
            send({ text: chunk.delta.text });
          }
        }

        activeConv.messages.push({ role: 'assistant', content: fullReply, createdAt: new Date() });
        user.messagesUsedThisMonth += 1;
        activeConv.save().catch(console.error);
        user.save().catch(console.error);

        send({ done: true, conversationId: activeConv._id.toString() });
      } catch (err: any) {
        console.error('Plugins error:', err);
        send({ error: err.message || 'Something went wrong' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' } });
}
