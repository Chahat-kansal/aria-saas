import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/mongodb';
import { Conversation } from '@/models/Conversation';
import { NextResponse } from 'next/server';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await connectDB();
  const convos = await Conversation.find({ userId: (session.user as any).id })
    .sort({ updatedAt: -1 })
    .limit(50)
    .select('_id title updatedAt model');
  return NextResponse.json(convos);
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await req.json();
  await connectDB();
  await Conversation.deleteOne({ _id: id, userId: (session.user as any).id });
  return NextResponse.json({ success: true });
}
