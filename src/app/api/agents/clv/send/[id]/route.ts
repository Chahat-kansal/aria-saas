export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { withErrorCapture } from '@/lib/api/with-error-capture';
import { sendSMS } from '@/lib/clicksend';

async function _POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Fetch the CLV score record with customer and business ownership check
  const { data: score } = await supabaseAdmin
    .from('customer_clv_scores')
    .select('id,business_id,customer_id,recommended_message,intervention_priority,clv_tier,businesses(user_id),pos_customers(name,email,phone,opted_in_sms)')
    .eq('id', id)
    .maybeSingle();

  if (!score) return NextResponse.json({ error: 'Score not found' }, { status: 404 });

  const bizOwner = (score.businesses as unknown as { user_id: string } | null)?.user_id;
  if (bizOwner !== user.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  if (!score.recommended_message) {
    return NextResponse.json({ error: 'No message generated for this customer yet' }, { status: 400 });
  }

  if (score.intervention_priority === 'none') {
    return NextResponse.json({ error: 'No intervention needed for this customer' }, { status: 400 });
  }

  const customer = score.pos_customers as unknown as { name: string; email: string | null; phone: string | null; opted_in_sms: boolean } | null;
  if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });

  let channel: 'sms' | 'email' | null = null;
  let sent = false;

  if (customer.phone && customer.opted_in_sms) {
    const result = await sendSMS(customer.phone, score.recommended_message);
    sent = result.ok;
    channel = 'sms';
    if (!result.ok) {
      return NextResponse.json({ error: 'SMS send failed' }, { status: 500 });
    }
  } else if (customer.email) {
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) return NextResponse.json({ error: 'No email provider configured' }, { status: 503 });
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + resendKey },
      body: JSON.stringify({
        from: 'noreply@' + (process.env.RESEND_DOMAIN ?? 'mail.aria-os.com.au'),
        to: customer.email,
        subject: 'A personal note from us',
        text: score.recommended_message,
      }),
      signal: AbortSignal.timeout(8000),
    });
    sent = res.ok;
    channel = 'email';
    if (!res.ok) {
      return NextResponse.json({ error: 'Email send failed' }, { status: 500 });
    }
  } else {
    return NextResponse.json({ error: 'Customer has no contactable channel (no phone/SMS consent or email)' }, { status: 422 });
  }

  if (sent) {
    await supabaseAdmin
      .from('customer_clv_scores')
      .update({ intervention_sent_at: new Date().toISOString() })
      .eq('id', id);

    try {
      await supabaseAdmin.from('aria_autopilot_actions').insert({
        business_id: score.business_id,
        action_type: 'clv_intervention',
        action_data: {
          customer_id: score.customer_id,
          score_id: id,
          tier: score.clv_tier,
          priority: score.intervention_priority,
          channel,
        },
        status: 'executed',
        executed_at: new Date().toISOString(),
      });
    } catch { /* non-fatal */ }
  }

  return NextResponse.json({ ok: true, channel, sent });
}

export const POST = withErrorCapture('agents/clv/send/[id]', _POST);
