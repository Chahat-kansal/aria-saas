import { createServerSupabaseClient } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';
import { withErrorCapture } from '@/lib/api/with-error-capture'

export const maxDuration = 120;

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

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 }); }

  const { message, conversationId, model, enableWebSearch, system } = body;
  if (!message?.trim()) return new Response(JSON.stringify({ error: 'Message required' }), { status: 400 });

  const { data: business } = await supabase
    .from('businesses')
    .select('plan')
    .eq('user_id', user.id)
    .single();

  const plan = business?.plan ?? 'starter';
  const planModels = plan === 'pro'
    ? ['claude-haiku-4-5-20251001', 'claude-sonnet-4-5-20250929', 'claude-opus-4-5-20251101']
    : ['claude-haiku-4-5-20251001'];
  const safeModel = ALLOWED_MODELS.has(model) && planModels.includes(model) ? model : 'claude-haiku-4-5-20251001';
  const canSearch = plan === 'pro' && enableWebSearch;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      try {
        let convId = conversationId;
        let history: Array<{ role: string; content: string }> = [];

        if (convId) {
          const { data } = await supabase
            .from('conversations')
            .select('messages')
            .eq('id', convId)
            .eq('user_id', user.id)
            .single();
          if (data) history = (data.messages as any[]) || [];
        } else {
          const { data } = await supabase
            .from('conversations')
            .insert({ user_id: user.id, title: message.slice(0, 60), messages: [], aimodel: safeModel })
            .select('id')
            .single();
          convId = data?.id;
        }

        history.push({ role: 'user', content: message });

        const systemPrompt = system?.trim() || ARIA_SYSTEM;
        const tools = canSearch ? [{ type: 'web_search_20250305' as const, name: 'web_search' }] : undefined;

        let fullReply = '';
        const claudeStream = anthropic.messages.stream({
          model: safeModel,
          max_tokens: 8096,
          system: systemPrompt,
          messages: history.slice(-40) as any,
          ...(tools ? { tools } : {}),
        } as any);

        for await (const chunk of claudeStream) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            fullReply += chunk.delta.text;
            send({ text: chunk.delta.text });
          }
        }

        history.push({ role: 'assistant', content: fullReply });
        await supabase
          .from('conversations')
          .update({ messages: history, updated_at: new Date().toISOString() })
          .eq('id', convId);

        send({ done: true, conversationId: convId });
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

export const POST = withErrorCapture('plugins', _POST)
