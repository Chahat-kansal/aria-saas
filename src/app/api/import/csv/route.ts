import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

const UPLOAD_TYPES = new Set(['products', 'sales', 'inventory', 'supplier_costs']);

type ImportRow = Record<string, string | number | boolean | null>;

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const businessId = searchParams.get('business_id');
  if (!businessId) return NextResponse.json({ error: 'business_id required' }, { status: 400 });

  const { data: business } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', businessId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!business) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data, error } = await supabase
    .from('imported_files')
    .select('id, upload_type, file_name, row_count, columns, mapping, status, created_at')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(25);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    imported_files: data ?? [],
    latest_imported_at: data?.[0]?.created_at ?? null,
  });
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const businessId = body.business_id;
  const uploadType = body.upload_type;
  const rows = Array.isArray(body.rows) ? body.rows as ImportRow[] : [];
  const columns = Array.isArray(body.columns) ? body.columns.filter((c: unknown) => typeof c === 'string') : [];

  if (!businessId) return NextResponse.json({ error: 'business_id required' }, { status: 400 });
  if (!UPLOAD_TYPES.has(uploadType)) return NextResponse.json({ error: 'upload_type invalid' }, { status: 400 });
  if (!rows.length || !columns.length) return NextResponse.json({ error: 'No rows or columns found' }, { status: 400 });
  if (rows.length > 5000) return NextResponse.json({ error: 'Please import 5,000 rows or fewer at a time' }, { status: 400 });

  const { data: business } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', businessId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!business) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const cleanRows = rows.map(row => {
    const next: ImportRow = {};
    for (const column of columns) {
      const value = row[column];
      next[column] = typeof value === 'string' ? value.slice(0, 500) : value ?? null;
    }
    return next;
  });

  const { data, error } = await supabase
    .from('imported_files')
    .insert({
      business_id: businessId,
      upload_type: uploadType,
      file_name: typeof body.file_name === 'string' ? body.file_name : null,
      columns,
      rows: cleanRows,
      row_count: cleanRows.length,
      mapping: body.mapping && typeof body.mapping === 'object' ? body.mapping : {},
      status: 'imported',
    })
    .select('id, row_count, upload_type')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ imported_file: data });
}

export const GET = withErrorCapture('import/csv', _GET)
export const POST = withErrorCapture('import/csv', _POST)
