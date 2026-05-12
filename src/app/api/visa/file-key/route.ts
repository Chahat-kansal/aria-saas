import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { deriveFileKey } from '@/lib/encryption';
import { logAuditEvent } from '@/lib/audit';
import { withErrorCapture } from '@/lib/api/with-error-capture'

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function _GET(req: Request) {
  try {
    const supabase = createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const fileId = searchParams.get('file_id');
    const businessId = searchParams.get('business_id');

    if (!fileId || !businessId) {
      return NextResponse.json({ error: 'file_id and business_id required' }, { status: 400 });
    }

    // Verify business ownership
    const { data: biz } = await supabase
      .from('businesses')
      .select('id')
      .eq('id', businessId)
      .eq('user_id', user.id)
      .single();

    if (!biz) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // For existing file downloads: verify file belongs to this business
    const { data: existingDoc } = await supabase
      .from('visa_documents')
      .select('id')
      .eq('id', fileId)
      .eq('business_id', businessId)
      .is('deleted_at', null)
      .maybeSingle();

    // If it's an existing file, it must belong to this business
    // If it's a new file_id (upload flow), skip this check
    const isNewFile = !existingDoc;

    if (!isNewFile && !existingDoc) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const fileKey = deriveFileKey(businessId, fileId);

    await logAuditEvent(supabase, {
      businessId,
      userId: user.id,
      action: 'visa_document.downloaded',
      resourceType: 'visa_document',
      resourceId: fileId,
      request: req,
      metadata: { operation: isNewFile ? 'upload_key' : 'download_key' },
    });

    return NextResponse.json({ file_key: fileKey });
  } catch (err) {
    console.error('File key error:', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export const GET = withErrorCapture('visa/file-key', _GET)
