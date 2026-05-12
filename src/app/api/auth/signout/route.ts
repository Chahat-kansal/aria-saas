import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _POST() {
  const supabase = createServerSupabaseClient();
  await supabase.auth.signOut();
  return NextResponse.json({ success: true });
}

export const POST = withErrorCapture('auth/signout', _POST)
