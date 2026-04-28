import { supabaseAdmin } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Preflight
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

// Public endpoint — returns only safe display config, never full widget data
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get('key');

  if (!key) {
    return NextResponse.json({ error: 'key required' }, { status: 400, headers: CORS });
  }

  const { data, error } = await supabaseAdmin
    .from('widget_configs')
    .select('bot_name, primary_color, greeting, enabled')
    .eq('api_key', key)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404, headers: CORS });
  }

  if (!data.enabled) {
    return NextResponse.json({ enabled: false }, { headers: CORS });
  }

  return NextResponse.json({
    enabled: true,
    bot_name: data.bot_name,
    primary_color: data.primary_color,
    greeting: data.greeting,
  }, { headers: CORS });
}
