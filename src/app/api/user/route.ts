import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { connectDB } from '@/lib/mongodb';
import { User } from '@/models/User';
import { NextResponse } from 'next/server';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await connectDB();
  const user = await User.findById((session.user as any).id).select('-password');
  return NextResponse.json({
    name: user?.name, email: user?.email, image: user?.image,
    plan: user?.plan, messagesUsedThisMonth: user?.messagesUsedThisMonth,
  });
}
