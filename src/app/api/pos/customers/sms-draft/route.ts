export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';
import { withErrorCapture } from '@/lib/api/with-error-capture'

const anthropic = new Anthropic();

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: _ab } = await supabase.from('user_active_business').select('business_id').eq('user_id', user.id).maybeSingle()
  const bid = (_ab?.business_id as string) ?? null
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });

  const { customer_name, segment, days_since, ltv } = await req.json() as {
    customer_name: string;
    segment: string;
    days_since: number | null;
    ltv: number;
  };

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      messages: [{
        role: 'user',
        content: `Write a friendly SMS for an Australian retail customer. Max 140 chars. No emojis. Australian English.
Customer: ${customer_name}, segment: ${segment}, days since last visit: ${days_since ?? 'unknown'}, LTV: A$${ltv.toFixed(0)}.
${segment === 'At Risk' ? 'They haven\'t visited in a while — win them back.' : 'Thank them and mention a current deal.'}
Return ONLY the message text, nothing else.`,
      }],
    });
    const text = msg.content[0]?.type === 'text' ? msg.content[0].text.trim() : '';
    return NextResponse.json({ message: text.slice(0, 140) });
  } catch (e) {
    console.error('[sms-draft]', e);
    return NextResponse.json({ message: `Hi ${customer_name}, we miss you! Pop in and see what\'s new.` });
  }
}

export const POST = withErrorCapture('pos/customers/sms-draft', _POST)
