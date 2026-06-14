export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/auth/cron';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { withErrorCapture } from '@/lib/api/with-error-capture';
import { upsertAriaAction } from '@/lib/aria/upsert-aria-action';

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

async function _GET(req: Request) {
  const denied = verifyCronAuth(req)
  if (denied) return denied
  const today = new Date().toISOString().slice(0, 10);
  const in3Days = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

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
  let remindersSent = 0, overdueNoticesSent = 0, finalNoticesSent = 0

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

    // 7-day final notice: overdue invoices with due_date <= 7 days ago
    // Guard with invoice_reminders to avoid re-sending
    const { data: sevenDayOverdue } = await supabaseAdmin
      .from('invoices')
      .select('id, invoice_number, bill_to_name, bill_to_email, total, business_id, due_date')
      .eq('status', 'overdue')
      .eq('auto_reminders', true)
      .lte('due_date', sevenDaysAgo)

    for (const inv of sevenDayOverdue ?? []) {
      if (!inv.bill_to_email) continue
      const { data: existing } = await supabaseAdmin
        .from('invoice_reminders')
        .select('id')
        .eq('invoice_id', inv.id)
        .eq('trigger_type', 'day_of_overdue')
        .maybeSingle()
      if (existing) continue

      const { data: biz } = await supabaseAdmin.from('businesses').select('name').eq('id', inv.business_id).maybeSingle()
      const bizName = biz?.name ?? 'Your supplier'
      const from = fromDomain ? bizName + ' <invoices@' + fromDomain + '>' : bizName + ' <onboarding@resend.dev>'
      const dueDateStr = new Date(inv.due_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
      const text = 'Hi ' + inv.bill_to_name + ',\n\nFINAL NOTICE: Invoice ' + inv.invoice_number +
        ' for $' + (Number(inv.total) || 0).toFixed(2) + ' AUD was due on ' + dueDateStr + ' and remains unpaid.\n\n' +
        'Please contact us immediately to arrange payment or discuss a payment plan.\n\n' +
        'If payment is not received, this account may be escalated.\n\n' +
        'Thank you,\n' + bizName
      const ok = await sendReminderEmail(resendKey, from, inv.bill_to_email, 'FINAL NOTICE: Invoice ' + inv.invoice_number + ' from ' + bizName, text)
      if (ok) {
        finalNoticesSent++
        await supabaseAdmin.from('invoice_reminders').insert({
          invoice_id: inv.id,
          business_id: inv.business_id,
          remind_at: new Date().toISOString(),
          trigger_type: 'day_of_overdue',
          sent_at: new Date().toISOString(),
        })
        await upsertAriaAction({
          business_id: inv.business_id as string,
          category: 'revenue',
          title: 'Invoice ' + inv.invoice_number + ' overdue 7+ days — escalate collection',
          recommendation: 'Follow up directly with ' + inv.bill_to_name + ' — invoice has been overdue for 7+ days. Consider phone call or payment plan.',
          reason: 'Invoice ' + inv.invoice_number + ' for $' + (Number(inv.total) || 0).toFixed(2) + ' AUD has been overdue since ' + dueDateStr + '.',
          expected_impact: '$' + (Number(inv.total) || 0).toFixed(2) + ' revenue recovery',
          confidence: 'high',
          priority: 'high',
          source: 'cron/mark-overdue',
          payload: { invoice_id: inv.id, due_date: inv.due_date, total: inv.total },
        })
      }
    }
  }

  return NextResponse.json({
    ok: true,
    invoices_flipped: flippedInvs?.length ?? 0,
    compliance_flipped: comp?.length ?? 0,
    overdue_notices_sent: overdueNoticesSent,
    advance_reminders_sent: remindersSent,
    seven_day_final_notices_sent: finalNoticesSent,
    errors: [invErr?.message, compErr?.message].filter(Boolean),
  });
}

export const GET = withErrorCapture('cron/mark-overdue', _GET);
