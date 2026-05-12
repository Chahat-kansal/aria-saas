export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getAdminClient, logAdminAction, isAdminEmail } from '@/lib/admin';
import { sendEmail } from '@/lib/external-apis';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { to, subject, html } = await req.json();
  if (!subject || !html) return NextResponse.json({ error: 'subject and html required' }, { status: 400 });

  const db = getAdminClient();
  let query = db.from('businesses').select('id, name, plan');
  if (to && to !== 'all') query = query.eq('plan', to);

  const { data: businesses } = await query.eq('is_active', true);

  // Get user emails via auth admin API
  let sent = 0;
  const { data: { users: authUsers } } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const emailByUserId = Object.fromEntries((authUsers || []).map(u => [u.id, u.email]));

  // Fetch owner user_ids for the businesses
  const bizIds = (businesses || []).map(b => b.id);
  const { data: bizOwners } = await db.from('businesses').select('id, user_id').in('id', bizIds);
  const userIdByBiz = Object.fromEntries((bizOwners || []).map(b => [b.id, b.user_id]));

  const emails: string[] = [];
  for (const biz of (businesses || [])) {
    const uid = userIdByBiz[biz.id];
    const email = uid ? emailByUserId[uid] : null;
    if (email) emails.push(email);
  }

  // Send in batches
  for (const email of emails) {
    const ok = await sendEmail({ to: email, subject, html }).catch(() => false);
    if (ok) sent++;
  }

  await logAdminAction({ admin_email: user.email!, action: 'send_email', target_type: 'system', details: { to, subject, sent_count: sent } });

  return NextResponse.json({ ok: true, sent_count: sent, total_recipients: emails.length });
}

export const POST = withErrorCapture('admin/send-email', _POST)
