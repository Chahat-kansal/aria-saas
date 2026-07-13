export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { isAdminEmail } from '@/lib/admin'

// SECURITY-P1 (C-07) — this health-check returned the Anthropic key prefix + validity to ANY
// unauthenticated caller, confirming live credentials and their format. Gated behind isAdminEmail
// per the audit's own fix pattern (kept, not deleted — still useful as a founder-only health check).
async function _GET() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const key = process.env.ANTHROPIC_API_KEY;
  return NextResponse.json({
    status: 'ok',
    has_anthropic_key: !!key,
    key_preview: key ? key.substring(0, 14) + '...' : 'MISSING',
    key_valid: key ? key.startsWith('sk-ant-') : false,
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
}

export const GET = withErrorCapture('aria/test', _GET)
