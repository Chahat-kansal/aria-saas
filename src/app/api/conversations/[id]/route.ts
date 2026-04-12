import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/mongodb';
import { Conversation } from '@/models/Conversation';
import { NextResponse } from 'next/server';

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await connectDB();
  const convo = await Conversation.findOne({ _id: params.id, userId: (session.user as any).id });
  if (!convo) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(convo);
}
