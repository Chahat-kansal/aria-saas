import { createServerSupabaseClient } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 120;
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const AGENT_SYSTEM = `You are Aria Agent — an autonomous AI that breaks down goals into steps and executes them.

When given a goal, you:
1. Analyze what's needed
2. Break into clear numbered steps
3. Execute each step, showing your work
4. Deliver a final complete result

Format your response as:
**Goal Analysis:** [brief analysis]

**Plan:**
1. [step]
2. [step]
...

**Execution:**

[Step 1: name]
[your work for step 1]

[Step 2: name]
[your work for step 2]
...

**Final Result:**
[the complete deliverable]

Be thorough. Actually do the work at each step, don't just describe it.`;

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  // Check plan — use most permissive plan across all businesses
  const { data: allBiz } = await supabase
    .from('businesses')
    .select('plan')
    .eq('user_id', user.id);
  const business = { plan: (allBiz ?? []).some(b => b.plan === 'pro') ? 'pro' : (allBiz ?? []).some(b => b.plan === 'growth') ? 'growth' : 'starter' };

  if (business?.plan === 'starter') {
    return new Response(JSON.stringify({ error: 'Agent mode requires Growth or Pro plan' }), { status: 403 });
  }

  const { goal, context } = await req.json();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (d: object) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(d)}\n\n`));
      try {
        const claudeStream = anthropic.messages.stream({
          model: 'claude-sonnet-4-5-20250929',
          max_tokens: 16000,
          system: AGENT_SYSTEM,
          messages: [{ role: 'user', content: context ? `Goal: ${goal}\n\nContext: ${context}` : `Goal: ${goal}` }],
        });
        for await (const chunk of claudeStream) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            send({ text: chunk.delta.text });
          }
        }
        send({ done: true });
      } catch (err: any) {
        send({ error: err.message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
}