import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { conversationId, fromMessageIndex } = await req.json();

  const { data: original } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', conversationId)
    .eq('user_id', user.id)
    .single();

  if (!original) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const branchedMessages = (original.messages as any[]).slice(0, fromMessageIndex + 1);

  const { data: branch } = await supabase
    .from('conversations')
    .insert({
      user_id: user.id,
      title: `🌿 Branch of: ${original.title}`,
      messages: branchedMessages,
      aimodel: original.aimodel,
      parent_conversation_id: conversationId,
      branch_point: fromMessageIndex,
    })
    .select()
    .single();

  return NextResponse.json({ conversationId: branch?.id, title: branch?.title });
}

export const POST = withErrorCapture('conversations/branch', _POST)
