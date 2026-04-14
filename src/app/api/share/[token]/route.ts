import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import { Conversation } from '@/models/Conversation';

export async function GET(req: Request, { params }: { params: { token: string } }) {
  await connectDB();
  const conv = await Conversation.findOne({ shareToken: params.token });
  if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({
    title: conv.title,
    messages: conv.messages.map((m: any) => ({ role: m.role, content: m.content })),
    model: conv.model,
    createdAt: conv.createdAt,
  });
}
