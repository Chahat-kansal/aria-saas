import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import crypto from 'node:crypto';

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { conversationId } = await req.json();

  const { data: conv } = await supabase
    .from('conversations')
    .select('share_token')
    .eq('id', conversationId)
    .eq('user_id', session.user.id)
    .single();

  if (!conv) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let token = conv.share_token;
  if (!token) {
    token = crypto.randomBytes(16).toString('hex');
    await supabase.from('conversations').update({ share_token: token }).eq('id', conversationId);
  }

  const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL || ''}/share/${token}`;
  return NextResponse.json({ shareUrl, token });
}

export async function DELETE(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { conversationId } = await req.json();
  await supabase.from('conversations').update({ share_token: null }).eq('id', conversationId).eq('user_id', session.user.id);
  return NextResponse.json({ success: true });
}