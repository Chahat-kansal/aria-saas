import { createServerSupabaseClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (id) {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .eq('user_id', session.user.id)
      .single();
    if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(data);
  }

  const { data } = await supabase
    .from('projects')
    .select('id,name,description,framework,updated_at,files')
    .eq('user_id', session.user.id)
    .order('updated_at', { ascending: false });

  return NextResponse.json(data || []);
}

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { name, description, files, framework } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: 'Project name required' }, { status: 400 });

  const { data, error } = await supabase
    .from('projects')
    .insert({ user_id: session.user.id, name: name.trim().slice(0, 100), description: description?.slice(0, 500) || '', files: files || [], framework: framework || 'html' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function PUT(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, name, description, files, framework } = await req.json();
  if (!id) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

  const { data, error } = await supabase
    .from('projects')
    .update({ name, description, files, framework, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', session.user.id)
    .select()
    .single();

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(data);
}

export async function DELETE(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await req.json();
  await supabase.from('projects').delete().eq('id', id).eq('user_id', session.user.id);
  return NextResponse.json({ success: true });
}