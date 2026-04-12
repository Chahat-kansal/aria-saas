import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import { User } from '@/models/User';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await connectDB();
  const user = await User.findById((session.user as any).id);
  const maxSize = user?.plan === 'pro' ? 20 * 1024 * 1024 : 5 * 1024 * 1024;

  const form = await req.formData();
  const file = form.get('file') as File;
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });
  if (file.size > maxSize) return NextResponse.json({ error: `File too large. Max ${user?.plan === 'pro' ? '20MB' : '5MB'} on your plan.` }, { status: 413 });

  const allowed = ['image/jpeg','image/png','image/gif','image/webp','application/pdf','text/plain','text/csv','text/markdown'];
  if (!allowed.includes(file.type)) return NextResponse.json({ error: 'File type not supported' }, { status: 415 });

  const blob = await put(`uploads/${(session.user as any).id}/${Date.now()}-${file.name}`, file, { access: 'public' });
  return NextResponse.json({ url: blob.url, name: file.name, type: file.type, size: file.size });
}
