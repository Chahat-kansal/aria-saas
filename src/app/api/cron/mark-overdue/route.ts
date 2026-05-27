export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { withErrorCapture } from '@/lib/api/with-error-capture';

async function _GET() {
  const today = new Date().toISOString().slice(0, 10);

  // Invoices: any 'sent' invoice past due_date → 'overdue'
  const { data: invs, error: invErr } = await supabaseAdmin
    .from('invoices')
    .update({ status: 'overdue' })
    .eq('status', 'sent')
    .lt('due_date', today)
    .select('id');

  // Compliance items: any 'pending' item past due_date → 'overdue'
  const { data: comp, error: compErr } = await supabaseAdmin
    .from('aria_compliance_items')
    .update({ status: 'overdue' })
    .eq('status', 'pending')
    .lt('due_date', today)
    .select('id');

  return NextResponse.json({
    ok: true,
    invoices_flipped: invs?.length ?? 0,
    compliance_flipped: comp?.length ?? 0,
    errors: [invErr?.message, compErr?.message].filter(Boolean),
  });
}

export const GET = withErrorCapture('cron/mark-overdue', _GET);
