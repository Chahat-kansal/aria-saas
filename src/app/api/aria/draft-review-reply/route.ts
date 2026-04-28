export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 20;

import { createServerSupabaseClient } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { review_id, business_id } = await req.json();
  if (!review_id || !business_id) return NextResponse.json({ error: 'review_id and business_id required' }, { status: 400 });

  const { data: biz } = await supabase.from('businesses').select('id, name, industry').eq('id', business_id).eq('user_id', user.id).single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: review } = await supabase.from('reviews').select('*').eq('id', review_id).eq('business_id', business_id).single();
  if (!review) return NextResponse.json({ error: 'Review not found' }, { status: 404 });

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: `You are writing a professional reply to a Google review for an Australian business. Be warm, genuine, specific. Under 100 words. Thank them for the feedback. If negative, acknowledge and offer to resolve.`,
      messages: [{
        role: 'user',
        content: `Write a reply to this ${review.rating ?? '?'}-star review for ${biz.name} (${biz.industry}): "${review.text ?? review.review_text ?? review.content ?? 'No text provided'}"`,
      }],
    });
    const draft = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '';
    return NextResponse.json({ draft });
  } catch {
    return NextResponse.json({ draft: `Thank you so much for your feedback! We really appreciate you taking the time to share your experience with ${biz.name}. We hope to see you again soon!` });
  }
}

export async function PATCH(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { review_id, business_id, response } = await req.json();
  if (!review_id || !business_id) return NextResponse.json({ error: 'review_id and business_id required' }, { status: 400 });

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single();
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { error: e } = await supabase.from('reviews')
    .update({ response, responded_at: new Date().toISOString() })
    .eq('id', review_id)
    .eq('business_id', business_id);
  if (e) return NextResponse.json({ error: e.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
