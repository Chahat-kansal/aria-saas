import { createServerSupabaseClient } from '@/lib/supabase-server';
import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: business } = await supabase
    .from('businesses')
    .select('plan')
    .eq('user_id', session.user.id)
    .single();

  const isPro = business?.plan === 'pro';
  const maxSize = isPro ? 20 * 1024 * 1024 : 5 * 1024 * 1024;

  const form = await req.formData();
  const file = form.get('file') as File;
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });
  if (file.size > maxSize) {
    return NextResponse.json({ error: `File too large. Max ${isPro ? '20MB' : '5MB'} on your plan.` }, { status: 413 });
  }

  const allowed = ['image/jpeg','image/png','image/gif','image/webp','application/pdf','text/plain','text/csv','text/markdown'];
  if (!allowed.includes(file.type)) return NextResponse.json({ error: 'File type not supported' }, { status: 415 });

  const blob = await put(`uploads/${session.user.id}/${Date.now()}-${file.name}`, file, { access: 'public' });
  return NextResponse.json({ url: blob.url, name: file.name, type: file.type, size: file.size });
}