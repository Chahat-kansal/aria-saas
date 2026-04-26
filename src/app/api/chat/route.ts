import { createServerSupabaseClient } from '@/lib/supabase-server';
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

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  let body: { message?: string; conversationId?: string; model?: string; system?: string };
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 }); }

  const { message, conversationId, model, system } = body;
  if (!message?.trim()) return new Response(JSON.stringify({ error: 'Message required' }), { status: 400 });

  const safeModel = ALLOWED_MODELS.has(model || '') ? model! : 'claude-haiku-4-5-20251001';

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      const openedSessions = new Set<string>();

      try {
        // Load or create conversation
        let conversation: { id: string; messages: Array<{ role: string; content: string }> } | null = null;

        if (conversationId) {
          const { data } = await supabase
            .from('conversations')
            .select('*')
            .eq('id', conversationId)
            .eq('user_id', user.id)
            .single();
          conversation = data;
        }

        if (!conversation) {
          const { data } = await supabase
            .from('conversations')
            .insert({ user_id: user.id, title: message.slice(0, 60), messages: [], aimodel: safeModel })
            .select()
            .single();
          conversation = data;
        }

        if (!conversation) throw new Error('Failed to create conversation');

        const messages = [...((conversation.messages as Array<{ role: string; content: string }>) || [])];
        messages.push({ role: 'user', content: message });

        const history = messages.slice(-20);
        const systemPrompt = system?.trim() || ARIA_SYSTEM;

        const tools: any[] = [
          { type: 'web_search_20250305' as const, name: 'web_search' },
          ...ARIA_TOOLS.filter(t => !('type' in t) || t.type !== 'web_search_20250305'),
        ];

        let loopMessages: any[] = [...history];
        let fullReply = '';

        for (let step = 0; step < 8; step++) {
          const response = await anthropic.messages.create({
            model: safeModel,
            max_tokens: 4096,
            system: systemPrompt,
            messages: loopMessages,
            tools,
          } as any);

          const content = response.content || [];
          loopMessages.push({ role: 'assistant', content });

          let usedTool = false;
          for (const block of content) {
            if (block.type === 'text') { fullReply += block.text; send({ text: block.text }); }
            if (block.type === 'tool_use') {
              usedTool = true;
              try {
                const result = await runAriaTool(block.name, block.input || {});
                if (result && typeof result === 'object' && 'sessionId' in result) openedSessions.add((result as any).sessionId);
                loopMessages.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) }] });
                send({ tool: block.name, toolResult: result });
              } catch (err: any) {
                loopMessages.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify({ error: err.message }) }] });
              }
            }
          }
          if (!usedTool) break;
        }

        messages.push({ role: 'assistant', content: fullReply });
        await supabase.from('conversations').update({ messages, updated_at: new Date().toISOString() }).eq('id', conversation.id);

        for (const sid of openedSessions) await browserClose(sid).catch(() => {});
        send({ done: true, conversationId: conversation.id });
      } catch (err: any) {
        send({ error: err.message || 'Something went wrong' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  });
}