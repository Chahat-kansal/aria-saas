import { createServerSupabaseClient } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';
import { withErrorCapture } from '@/lib/api/with-error-capture'

export const maxDuration = 120;

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
3. The opening \`\`\`html (or \`\`\`jsx) tag must be on its own line
4. The closing \`\`\` must be on its own line after all the code
5. After the code block, write ONLY 1-2 sentences describing what you built
6. DO NOT list features, DO NOT explain the code — the user can see it in the preview
7. Keep your text response under 3 sentences total

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
- Real content: realistic data, real-looking numbers — never "Lorem ipsum"
- Working interactions: every button clicks, every form validates
- Beautiful visuals: gradients, shadows, smooth hover transitions
- Dark mode by default
- Mobile responsive

## WHEN MODIFYING CODE:
Always output the complete updated file — never partial updates or diffs.`;

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  const { message, conversationId, model } = await req.json();
  if (!message?.trim()) return new Response(JSON.stringify({ error: 'Message required' }), { status: 400 });

  const safeModel = model === 'claude-opus-4-5-20251101' ? model : 'claude-sonnet-4-5-20250929';

  // Load or create conversation
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
      .insert({ user_id: user.id, title: `🔨 ${message.slice(0, 55)}`, messages: [], aimodel: safeModel })
      .select('id')
      .single();
    convId = data?.id;
  }

  history.push({ role: 'user', content: message });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      let fullReply = '';
      try {
        const claudeStream = anthropic.messages.stream({
          model: safeModel,
          max_tokens: 16000,
          system: BUILDER_SYSTEM,
          messages: history.slice(-20) as any,
        });

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
        send({ error: err.message || 'Build failed' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  });
}

export const POST = withErrorCapture('builder', _POST)
