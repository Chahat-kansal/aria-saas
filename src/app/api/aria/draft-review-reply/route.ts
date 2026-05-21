export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 20;

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _POST(req: Request) {
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
    const prompt = `Write a reply to this ${review.rating ?? '?'}-star review for ${biz.name} (${biz.industry}): "${review.text ?? review.review_text ?? review.content ?? 'No text provided'}"`
    const _Anthropic2 = (await import('@anthropic-ai/sdk')).default
    const _client2 = new _Anthropic2({ apiKey: process.env.ANTHROPIC_API_KEY })
    const _msg2 = await _client2.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 250,
        tools: [{ type: 'web_search_20250305' as const, name: 'web_search' }],
      system: 'You are helping an Australian small business owner reply to customer reviews. Write professional, warm, authentic replies. Return ONLY the reply text — no quotes, no explanation.',
      messages: [{ role: 'user', content: prompt }],
    })
    const reply = _msg2.content[0].type === 'text' ? _msg2.content[0].text.trim() : ''
    return NextResponse.json({ draft: reply });
  } catch {
    return NextResponse.json({ draft: `Thank you so much for your feedback! We really appreciate you taking the time to share your experience with ${biz.name}. We hope to see you again soon!` });
  }
}

async function _PATCH(req: Request) {
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

export const POST = withErrorCapture('aria/draft-review-reply', _POST)
export const PATCH = withErrorCapture('aria/draft-review-reply', _PATCH)
