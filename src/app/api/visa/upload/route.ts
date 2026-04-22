import { createServerSupabaseClient } from '@/lib/supabase-server';
import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const form = await req.formData();
    const file = form.get('file') as File | null;
    const clientId = form.get('client_id') as string;
    const documentType = (form.get('document_type') as string) || 'other';
    const expiryDate = form.get('expiry_date') as string | null;

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    if (!clientId) return NextResponse.json({ error: 'No client_id provided' }, { status: 400 });

    const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
    let fileUrl: string | null = null;

    if (blobToken && blobToken !== 'vercel_blob_rw_your-token') {
      const blob = await put(
        `visa-docs/${session.user.id}/${clientId}/${Date.now()}-${file.name}`,
        file,
        { access: 'public', token: blobToken }
      );
      fileUrl = blob.url;
    }

    const { data: doc, error } = await supabase.from('visa_documents').insert({
      agent_id: session.user.id,
      client_id: clientId,
      document_name: file.name,
      document_type: documentType,
      file_url: fileUrl,
      file_size: file.size,
      expiry_date: expiryDate || null,
      verified: false,
    }).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ document: doc });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}