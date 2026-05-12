export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { logAdminAction, isAdminEmail } from '@/lib/admin';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _POST() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });

  const res = await fetch(`${appUrl}/api/cron/nightly-sync`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${cronSecret}` },
  });

  const result = await res.json().catch(() => ({ ok: false }));
  await logAdminAction({ admin_email: user.email!, action: 'run_cron', target_type: 'system', details: { result } });

  return NextResponse.json({ ok: true, result });
}

export const POST = withErrorCapture('admin/system/run-cron', _POST)
