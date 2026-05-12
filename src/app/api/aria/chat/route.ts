import { createServerSupabaseClient } from '@/lib/supabase-server';
import { collectBusinessData } from '@/lib/aria/business-data';
import { chatWithBusinessBrain } from '@/lib/aria/business-brain';
import { withErrorCapture } from '@/lib/api/with-error-capture'

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const message = typeof body.message === 'string' ? body.message : body.query;
  const businessId = typeof body.business_id === 'string' ? body.business_id : '';

  if (!message?.trim()) return new Response(JSON.stringify({ error: 'message required' }), { status: 400 });
  if (!businessId) return new Response(JSON.stringify({ error: 'business_id required' }), { status: 400 });

  try {
    const businessData = await collectBusinessData(businessId, { userId: user.id, supabase });
    if (!businessData.business) return new Response(JSON.stringify({ error: 'Business not found' }), { status: 404 });

    const output = await chatWithBusinessBrain(businessData, {
      message,
      conversation_history: Array.isArray(body.conversation_history) ? body.conversation_history.slice(-10) : [],
    });

    return new Response(JSON.stringify(output), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[aria/chat] failed', error);
    return new Response(JSON.stringify({ error: 'Aria could not answer from business data right now.' }), { status: 500 });
  }
}

export const POST = withErrorCapture('aria/chat', _POST)
