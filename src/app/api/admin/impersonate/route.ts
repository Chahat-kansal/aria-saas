export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getAdminClient, logAdminAction, isAdminEmail } from '@/lib/admin';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Only owner role can impersonate
  const db = getAdminClient();
  const { data: adminUser } = await db.from('admin_users').select('role').eq('email', user.email!).maybeSingle();
  const role = adminUser?.role ?? 'owner';
  if (role !== 'owner' && role !== 'admin') {
    return NextResponse.json({ error: 'Impersonation requires owner or admin role' }, { status: 403 });
  }

  const { user_id, user_email } = await req.json();
  if (!user_id || !user_email) return NextResponse.json({ error: 'user_id and user_email required' }, { status: 400 });

  const { data, error } = await db.auth.admin.generateLink({
    type: 'magiclink',
    email: user_email,
  });

  if (error || !data?.properties?.action_link) {
    return NextResponse.json({ error: error?.message || 'Failed to generate link' }, { status: 500 });
  }

  await logAdminAction({
    admin_email: user.email!,
    admin_role: role,
    action: 'impersonate',
    target_type: 'user',
    target_id: user_id,
    target_name: user_email,
    details: { generated_at: new Date().toISOString() },
  });

  return NextResponse.json({ magic_link: data.properties.action_link });
}

export const POST = withErrorCapture('admin/impersonate', _POST)
