export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { withErrorCapture } from '@/lib/api/with-error-capture';

async function sendReminderEmail(
  resendKey: string,
  from: string,
  to: string,
  subject: string,
  text: string,
) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html: '<p style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;">' + text.replace(/\n/g, '<br>') + '</p>' }),
  })
  return res.ok
}

async function _GET() {
  const today = new Date().toISOString().slice(0, 10);
  const in3Days = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);

  // Mark sent invoices past due_date as overdue
  const { data: flippedInvs, error: invErr } = await supabaseAdmin
    .from('invoices')
    .update({ status: 'overdue', updated_at: new Date().toISOString() })
    .eq('status', 'sent')
    .lt('due_date', today)
    .select('id, invoice_number, bill_to_name, bill_to_email, total, business_id, due_date, auto_reminders');

  // Compliance items: pending past due_date → overdue
  const { data: comp, error: compErr } = await supabaseAdmin
    .from('compliance_items')
    .update({ status: 'overdue' })
    .eq('status', 'pending')
    .lt('due_date', today)
    .select('id');

  const resendKey = process.env.RESEND_API_KEY ?? ''
  const fromDomain = process.env.RESEND_FROM_DOMAIN ?? ''
  let remindersSent = 0, overdueNoticesSent = 0

  if (resendKey) {
    // Send overdue notices for newly-flipped invoices with auto_reminders=true
    for (const inv of flippedInvs ?? []) {
      if (!inv.auto_reminders || !inv.bill_to_email) continue
      const { data: biz } = await supabaseAdmin.from('businesses').select('name').eq('id', inv.business_id).maybeSingle()
      const bizName = biz?.name ?? 'Your supplier'
      const from = fromDomain ? bizName + ' <invoices@' + fromDomain + '>' : bizName + ' <onboarding@resend.dev>'
      const daysOverdue = inv.due_date
        ? Math.max(0, Math.floor((Date.now() - new Date(inv.due_date).getTime()) / 86400000))
        : 1
      const text = 'Hi ' + inv.bill_to_name + ',\n\nThis is a reminder that Invoice ' + inv.invoice_number +
        ' for $' + (Number(inv.total) || 0).toFixed(2) + ' AUD is now ' + daysOverdue + ' day(s) overdue.\n\n' +
        'Please arrange payment at your earliest convenience.\n\n' +
        'Thank you,\n' + bizName
      const ok = await sendReminderEmail(resendKey, from, inv.bill_to_email, 'OVERDUE: Invoice ' + inv.invoice_number + ' from ' + bizName, text)
      if (ok) overdueNoticesSent++
    }

    // 3-day advance reminders: sent invoices with auto_reminders=true due in exactly 3 days
    const { data: upcomingInvs } = await supabaseAdmin
      .from('invoices')
      .select('id, invoice_number, bill_to_name, bill_to_email, total, business_id, due_date')
      .eq('status', 'sent')
      .eq('auto_reminders', true)
      .eq('due_date', in3Days)

    for (const inv of upcomingInvs ?? []) {
      if (!inv.bill_to_email) continue
      const { data: biz } = await supabaseAdmin.from('businesses').select('name').eq('id', inv.business_id).maybeSingle()
      const bizName = biz?.name ?? 'Your supplier'
      const from = fromDomain ? bizName + ' <invoices@' + fromDomain + '>' : bizName + ' <onboarding@resend.dev>'
      const dueDateStr = new Date(inv.due_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
      const text = 'Hi ' + inv.bill_to_name + ',\n\nJust a friendly reminder that Invoice ' + inv.invoice_number +
        ' for $' + (Number(inv.total) || 0).toFixed(2) + ' AUD is due in 3 days on ' + dueDateStr + '.\n\n' +
        'Please ensure payment is arranged before the due date.\n\n' +
        'Thank you,\n' + bizName
      const ok = await sendReminderEmail(resendKey, from, inv.bill_to_email, 'Payment due in 3 days: Invoice ' + inv.invoice_number + ' from ' + bizName, text)
      if (ok) remindersSent++
    }
  }

  return NextResponse.json({
    ok: true,
    invoices_flipped: flippedInvs?.length ?? 0,
    compliance_flipped: comp?.length ?? 0,
    overdue_notices_sent: overdueNoticesSent,
    advance_reminders_sent: remindersSent,
    errors: [invErr?.message, compErr?.message].filter(Boolean),
  });
}

export const GET = withErrorCapture('cron/mark-overdue', _GET);
