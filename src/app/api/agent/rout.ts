import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import Anthropic from '@anthropic-ai/sdk';
import { connectDB } from '@/lib/mongodb';
import { User } from '@/models/User';

export const maxDuration = 60;
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
  const session = await getServerSession(authOptions);
  if (!session?.user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  await connectDB();
  const user = await User.findById((session.user as any).id);
  if (!user) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  if (user.plan !== 'pro') return new Response(JSON.stringify({ error: 'Agent mode requires Pro' }), { status: 403 });

  const { goal, context } = await req.json();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (d: object) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(d)}\n\n`));
      try {
        const messages: any[] = [{ role: 'user', content: context ? `Goal: ${goal}\n\nContext: ${context}` : `Goal: ${goal}` }];
        
        const claudeStream = await anthropic.messages.stream({
          model: 'claude-sonnet-4-5-20250929',
          max_tokens: 16000,
          system: AGENT_SYSTEM,
          messages,
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
    }
  });

  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
}
