export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture';
import { sendSMS } from '@/lib/clicksend';

interface Shift { staff_id: string; staff_name: string; date: string; start_time: string; end_time: string; role?: string; hours?: number }
interface StaffRow { id: string; name?: string | null; first_name?: string | null; last_name?: string | null; phone?: string | null; mobile?: string | null; personal_email?: string | null; work_email?: string | null }

// CANON-RAIL-1 beachhead — this is the highest-severity SECURITY-CRITICAL-4 finding
// (cross-tenant staff PII -> real SMS, B.1.2). business_id now resolved by withBusinessContext
// (the rail), replacing this file's own local getBid() — demonstrating the rail subsumes the
// manual per-route fix, not just future new routes.
async function _POST(req: Request, _context: unknown, { supabase, businessId: bid }: BusinessContext) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { data: roster } = await supabase.from('pos_roster_templates')
    .select('id, week_starting, shifts, business_id').eq('id', id).eq('business_id', bid).maybeSingle();
  if (!roster) return NextResponse.json({ error: 'Roster not found' }, { status: 404 });

  const shifts = (roster.shifts as unknown as Shift[]) ?? [];
  // Group shifts by staff
  const perStaff: Record<string, { name: string; shifts: Shift[] }> = {};
  for (const s of shifts) {
    if (!s.staff_id) continue;
    if (!perStaff[s.staff_id]) perStaff[s.staff_id] = { name: s.staff_name ?? 'Team member', shifts: [] };
    perStaff[s.staff_id].shifts.push(s);
  }

  // Resolve phones from pos_users first, then staff_members
  const staffIds = Object.keys(perStaff);
  if (staffIds.length === 0) return NextResponse.json({ ok: true, sent: 0, message: 'No shifts to notify' });

  // SECURITY-CRITICAL-4 (B.1.2) — staffIds come from roster.shifts, a client-writable JSON blob
  // (aria/roster PATCH lets the owner submit an edited shifts array with no per-entry staff_id
  // validation). Without this filter, supabaseAdmin (no RLS backstop) would resolve phone/email
  // for ANY staff_id across the whole platform and text them — scoping both lookups to this
  // roster's own business_id means a foreign staff_id in the shifts blob simply resolves to no
  // contact info, so no cross-tenant PII read and no SMS ever reaches someone outside this business.
  const [posUsers, staffMembers] = await Promise.all([
    supabaseAdmin.from('pos_users').select('id, name, phone').eq('business_id', bid).in('id', staffIds),
    supabaseAdmin.from('staff_members').select('id, first_name, last_name, phone, mobile, personal_email, work_email').eq('business_id', bid).in('id', staffIds),
  ]);

  const contactMap: Record<string, { phone: string | null; email: string | null; name: string }> = {};
  for (const u of (posUsers.data ?? []) as StaffRow[]) {
    contactMap[u.id] = { phone: u.phone ?? null, email: null, name: u.name ?? 'Team member' };
  }
  for (const m of (staffMembers.data ?? []) as StaffRow[]) {
    const phone = m.phone ?? m.mobile ?? null;
    const email = m.work_email ?? m.personal_email ?? null;
    const name = [m.first_name, m.last_name].filter(Boolean).join(' ') || contactMap[m.id]?.name || 'Team member';
    contactMap[m.id] = { phone: phone ?? contactMap[m.id]?.phone ?? null, email, name };
  }

  let sent = 0;
  const errors: string[] = [];
  for (const staffId of staffIds) {
    const c = contactMap[staffId];
    const info = perStaff[staffId];
    if (!c?.phone) { errors.push(`${info.name}: no phone`); continue }
    const lines = info.shifts.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 7).map(s => {
      const d = new Date(s.date).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
      return `${d}: ${s.start_time}-${s.end_time}`;
    }).join('\n');
    const body = `Your roster for week of ${roster.week_starting}:\n${lines}\n\nView at ariaos.site/dashboard/staff`;
    try {
      await sendSMS(c.phone, body);
      sent++;
    } catch (e) { errors.push(`${info.name}: ${(e as Error).message}`) }
  }

  return NextResponse.json({ ok: true, sent, errors, total_staff: staffIds.length });
}

export const POST = withBusinessContext('aria/roster/notify', _POST);
