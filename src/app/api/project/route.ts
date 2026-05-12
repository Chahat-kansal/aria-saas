import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (id) {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();
    if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(data);
  }

  const { data } = await supabase
    .from('projects')
    .select('id,name,description,framework,updated_at,files')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  return NextResponse.json(data || []);
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { name, description, files, framework } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: 'Project name required' }, { status: 400 });

  const { data, error } = await supabase
    .from('projects')
    .insert({ user_id: user.id, name: name.trim().slice(0, 100), description: description?.slice(0, 500) || '', files: files || [], framework: framework || 'html' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

async function _PUT(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, name, description, files, framework } = await req.json();
  if (!id) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  const { data, error } = await supabase
    .from('projects')
    .update({ name, description, files, framework, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(data);
}

async function _DELETE(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await req.json();
  await supabase.from('projects').delete().eq('id', id).eq('user_id', user.id);
  return NextResponse.json({ success: true });
}

export const GET = withErrorCapture('project', _GET)
export const POST = withErrorCapture('project', _POST)
export const PUT = withErrorCapture('project', _PUT)
export const DELETE = withErrorCapture('project', _DELETE)
