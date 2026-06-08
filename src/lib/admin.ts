import { createClient } from '@supabase/supabase-js';

export function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function logAdminAction(params: {
  admin_email: string;
  admin_role?: string;
  action: string;
  target_type?: string;
  target_id?: string;
  target_name?: string;
  details?: object;
}) {
  const db = getAdminClient();
  const { error } = await db.from('admin_audit_log').insert({
    ...params,
    created_at: new Date().toISOString(),
  });
  if (error) console.error('[logAdminAction] insert failed:', error.message, error.code);
}

export function formatCents(cents: number): string {
  return 'A$' + (cents / 100).toLocaleString('en-AU', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);
  return adminEmails.includes(email);
}
