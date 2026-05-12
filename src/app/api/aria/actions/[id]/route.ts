export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

const ALLOWED_STATUSES = new Set(['pending', 'approved', 'ignored', 'completed', 'edited']);
const ALLOWED_PRIORITIES = new Set(['high', 'medium', 'low']);
const EDITABLE_FIELDS = ['title', 'category', 'recommendation', 'reason', 'expected_impact', 'confidence', 'source', 'outcome_status', 'outcome_notes'] as const;

async function _PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { data: existing } = await supabase
    .from('aria_actions')
    .select('id, business_id, businesses!inner(user_id)')
    .eq('id', params.id)
    .eq('businesses.user_id', user.id)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.status === 'string') {
    if (!ALLOWED_STATUSES.has(body.status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    update.status = body.status;
    if (['approved', 'ignored', 'edited'].includes(body.status)) update.reviewed_at = new Date().toISOString();
    if (body.status === 'completed') update.completed_at = new Date().toISOString();
  }
  if (typeof body.priority === 'string') {
    if (!ALLOWED_PRIORITIES.has(body.priority)) return NextResponse.json({ error: 'Invalid priority' }, { status: 400 });
    update.priority = body.priority;
  }
  if (body.payload && typeof body.payload === 'object') update.payload = body.payload;
  if (typeof body.actual_impact === 'number') update.actual_impact = body.actual_impact;
  for (const field of EDITABLE_FIELDS) {
    if (typeof body[field] === 'string') update[field] = body[field];
  }

  const { data, error } = await supabase
    .from('aria_actions')
    .update(update)
    .eq('id', params.id)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ action: data });
}

export const PATCH = withErrorCapture('aria/actions/[id]', _PATCH)
