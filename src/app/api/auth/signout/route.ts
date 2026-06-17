import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  // SEC-H3: default 'local' (don't surprise multi-device users). Pass { scope: 'global' } to revoke
  // EVERY session of this user server-side ("sign out everywhere"), or 'others' to keep the current one.
  let scope: 'local' | 'global' | 'others' = 'local';
  try {
    const body = await req.json();
    if (body?.scope === 'global' || body?.scope === 'others') scope = body.scope;
  } catch { /* no/invalid body → local */ }
  await supabase.auth.signOut({ scope });
  return NextResponse.json({ success: true, scope });
}

export const POST = withErrorCapture('auth/signout', _POST)
