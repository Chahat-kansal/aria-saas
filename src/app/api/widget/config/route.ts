import { supabaseAdmin } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// Public endpoint — returns only safe display config, never full widget data
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get('key');

  if (!key) {
    return NextResponse.json({ error: 'key required' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('widget_configs')
    .select('bot_name, primary_color, greeting, enabled')
    .eq('api_key', key)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!data.enabled) {
    return NextResponse.json({ enabled: false });
  }

  return NextResponse.json({
    enabled: true,
    bot_name: data.bot_name,
    primary_color: data.primary_color,
    greeting: data.greeting,
  });
}