import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { logAuditEvent } from '@/lib/audit';

export const runtime = 'nodejs';

export async function DELETE(req: Request) {
  try {
    const supabase = createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const businessId = searchParams.get('business_id');
    if (!businessId) {
      return NextResponse.json({ error: 'business_id required' }, { status: 400 });
    }

    const body = await req.json();
    if (body?.confirm !== 'DELETE ALL VISA DATA') {
      return NextResponse.json(
        { error: 'Confirmation required. Send { confirm: "DELETE ALL VISA DATA" }' },
        { status: 400 }
      );
    }

    // Verify ownership
    const { data: biz } = await supabase
      .from('businesses')
      .select('id, name')
      .eq('id', businessId)
      .eq('user_id', user.id)
      .single();

    if (!biz) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const deletedAt = new Date().toISOString();
    const scheduledAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    // Soft-delete all visa data
    await Promise.all([
      supabase
        .from('visa_clients')
        .update({ deleted_at: deletedAt, deletion_scheduled_at: scheduledAt })
        .eq('business_id', businessId)
        .is('deleted_at', null),
      supabase
        .from('visa_applications')
        .update({ deleted_at: deletedAt, deletion_scheduled_at: scheduledAt })
        .eq('business_id', businessId)
        .is('deleted_at', null),
      supabase
        .from('visa_documents')
        .update({ deleted_at: deletedAt, deletion_scheduled_at: scheduledAt })
        .eq('business_id', businessId)
        .is('deleted_at', null),
    ]);

    await logAuditEvent(supabase, {
      businessId,
      userId: user.id,
      action: 'data.deletion_requested',
      resourceType: 'visa_data',
      request: req,
      metadata: {
        business_name: biz.name,
        hard_deletion_scheduled_at: scheduledAt,
      },
    });

    return NextResponse.json({
      ok: true,
      message: 'All visa data has been soft-deleted. Hard deletion scheduled for 30 days from now.',
      hard_deletion_date: scheduledAt,
    });
  } catch (err) {
    console.error('Delete visa data error:', err);
    return NextResponse.json({ error: 'Deletion failed' }, { status: 500 });
  }
}