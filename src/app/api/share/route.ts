import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import { Conversation } from '@/models/Conversation';
import crypto from 'node:crypto';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { conversationId } = await req.json();
  await connectDB();

  const conv = await Conversation.findOne({ _id: conversationId, userId: (session.user as any).id });
  if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (!conv.shareToken) {
    conv.shareToken = crypto.randomBytes(16).toString('hex');
    await conv.save();
  }

  const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://aria-saas-two.vercel.app'}/share/${conv.shareToken}`;
  return NextResponse.json({ shareUrl, token: conv.shareToken });
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { conversationId } = await req.json();
  await connectDB();
  await Conversation.updateOne({ _id: conversationId, userId: (session.user as any).id }, { $unset: { shareToken: 1 } });
  return NextResponse.json({ success: true });
}
