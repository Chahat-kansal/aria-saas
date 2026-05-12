import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET() {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: business } = await supabase
    .from('businesses')
    .select('name,plan,owner_name')
    .eq('user_id', user.id)
    .single();

  return NextResponse.json({
    id: user.id,
    name: user.user_metadata?.full_name || business?.owner_name || '',
    email: user.email,
    image: user.user_metadata?.avatar_url || null,
    plan: business?.plan || 'starter',
  });
}

export const GET = withErrorCapture('user', _GET)
