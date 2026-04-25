import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { logAuditEvent } from '@/lib/audit';
import { decryptVisaClient, decryptVisaApplication } from '@/lib/visa-encryption';

export const runtime = 'nodejs';

export async function POST(req: Request) {
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

    const [
      { data: clients },
      { data: applications },
      { data: documents },
    ] = await Promise.all([
      supabase
        .from('visa_clients')
        .select('*')
        .eq('business_id', businessId)
        .is('deleted_at', null),
      supabase
        .from('visa_applications')
        .select('*')
        .eq('business_id', businessId)
        .is('deleted_at', null),
      supabase
        .from('visa_documents')
        .select('id, business_id, original_name, original_type, file_size, created_at, encryption_version')
        .eq('business_id', businessId)
        .is('deleted_at', null),
    ]);

    // Decrypt sensitive fields before export
    const decryptedClients = (clients ?? []).map(c =>
      decryptVisaClient(c, businessId)
    );
    const decryptedApplications = (applications ?? []).map(a =>
      decryptVisaApplication(a, businessId)
    );

    await logAuditEvent(supabase, {
      businessId,
      userId: user.id,
      action: 'data.exported',
      resourceType: 'visa_data',
      request: req,
      metadata: {
        clients_count: clients?.length ?? 0,
        applications_count: applications?.length ?? 0,
        documents_count: documents?.length ?? 0,
      },
    });

    const exportPayload = {
      exported_at: new Date().toISOString(),
      business: { id: biz.id, name: biz.name },
      clients: decryptedClients,
      applications: decryptedApplications,
      documents_metadata: documents ?? [],
    };

    return new NextResponse(JSON.stringify(exportPayload, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="aria-visa-export-${businessId}-${new Date().toISOString().split('T')[0]}.json"`,
      },
    });
  } catch (err) {
    console.error('Export error:', err);
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}