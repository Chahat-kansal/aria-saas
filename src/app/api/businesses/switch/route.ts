import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { logAuditEvent } from '@/lib/audit';
import { withErrorCapture } from '@/lib/api/with-error-capture'

export const runtime = 'nodejs';

async function _PATCH(req: Request) {
  try {
    const supabase = createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { business_id } = await req.json();
    if (!business_id) {
      return NextResponse.json({ error: 'business_id required' }, { status: 400 });
    }

    // Verify ownership
    const { data: biz } = await supabase
      .from('businesses')
      .select('id, name')
      .eq('id', business_id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (!biz) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 });
    }

    await supabase
      .from('user_active_business')
      .upsert(
        { user_id: user.id, business_id, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      );

    await logAuditEvent(supabase, {
      businessId: business_id,
      userId: user.id,
      action: 'business.switched',
      resourceType: 'business',
      resourceId: business_id,
      request: req,
      metadata: { to_business_name: biz.name },
    });

    return NextResponse.json({ ok: true, business_id });
  } catch (err) {
    console.error('Switch business error:', err);
    return NextResponse.json({ error: 'Switch failed' }, { status: 500 });
  }
}

export const PATCH = withErrorCapture('businesses/switch', _PATCH)
