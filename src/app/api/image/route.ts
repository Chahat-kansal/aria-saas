import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import { User } from '@/models/User';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await connectDB();
  const user = await User.findById((session.user as any).id);
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  if (user.plan !== 'pro') {
    return NextResponse.json({ error: 'Image generation requires Pro plan.' }, { status: 403 });
  }

  const { prompt, size = '1024x1024', quality = 'standard', style = 'vivid' } = await req.json();

  if (!prompt?.trim()) return NextResponse.json({ error: 'Prompt required' }, { status: 400 });
  if (prompt.length > 4000) return NextResponse.json({ error: 'Prompt too long' }, { status: 400 });

  const validSizes = ['1024x1024', '1792x1024', '1024x1792'];
  if (!validSizes.includes(size)) return NextResponse.json({ error: 'Invalid size' }, { status: 400 });

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'OPENAI_API_KEY not configured on server' }, { status: 500 });
  }

  try {
    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt,
        n: 1,
        size,
        quality,
        style,
        response_format: 'url',
      }),
    });

    const data = await res.json();
    if (!res.ok) return NextResponse.json({ error: data.error?.message || 'Generation failed' }, { status: res.status });

    return NextResponse.json({ url: data.data[0].url, revised_prompt: data.data[0].revised_prompt });
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
