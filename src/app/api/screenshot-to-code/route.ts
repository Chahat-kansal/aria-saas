import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import { User } from '@/models/User';

export const maxDuration = 60;
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await connectDB();
  const user = await User.findById((session.user as any).id);
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { imageBase64, mimeType = 'image/png', framework = 'html' } = await req.json();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (d: object) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(d)}\n\n`));
      try {
        const systemPrompt = `You are an expert UI developer. Analyze the provided screenshot and recreate it as pixel-perfect ${framework === 'html' ? 'HTML with Tailwind CSS' : 'React JSX with Tailwind'}.

Rules:
- Match colors, fonts, spacing, layout exactly
- Make it fully interactive where possible
- Use Tailwind CDN, no build step needed  
- Output ONE complete code block
- For images, use placeholder colors or gradients that match
- Wrap in \`\`\`${framework === 'html' ? 'html' : 'jsx'} ... \`\`\``;

        const claudeStream = await anthropic.messages.stream({
          model: 'claude-sonnet-4-5-20250929',
          max_tokens: 16000,
          system: systemPrompt,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mimeType as any, data: imageBase64 } },
              { type: 'text', text: `Recreate this UI as working ${framework} code. Make it pixel-perfect and fully functional.` }
            ]
          }]
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
