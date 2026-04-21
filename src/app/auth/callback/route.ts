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
        .select('id, onboarding_complete')
        .eq('user_id', data.session.user.id)
        .single();

      if (business?.onboarding_complete) {
        return NextResponse.redirect(`${origin}/dashboard`);
      }
      return NextResponse.redirect(`${origin}/onboarding/industry`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=oauth_failed`);
}
