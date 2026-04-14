import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import { Conversation } from '@/models/Conversation';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { conversationId, fromMessageIndex } = await req.json();
  await connectDB();

  const original = await Conversation.findOne({ _id: conversationId, userId: (session.user as any).id });
  if (!original) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Clone conversation up to the branch point
  const branchedMessages = original.messages.slice(0, fromMessageIndex + 1);
  const branch = await Conversation.create({
    userId: original.userId,
    title: `🌿 Branch of: ${original.title}`,
    messages: branchedMessages,
    model: original.model,
    parentConversationId: conversationId,
    branchPoint: fromMessageIndex,
  });

  return NextResponse.json({ conversationId: branch._id.toString(), title: branch.title });
}
