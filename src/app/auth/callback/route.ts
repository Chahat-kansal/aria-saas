import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  if (code) {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.session) {
      // Check if this user has an existing business (returning user)
      const { data: business } = await supabase
        .from('businesses')
        .select('id, onboarding_complete, access_status')
        .eq('user_id', data.session.user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (business?.access_status === 'pending_review' || business?.access_status === 'rejected') {
        return NextResponse.redirect(`${origin}/onboarding/holding`);
      }
      if (business?.onboarding_complete) {
        return NextResponse.redirect(`${origin}/dashboard`);
      }
      return NextResponse.redirect(`${origin}/onboarding`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=oauth_failed`);
}
