export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { withErrorCapture } from '@/lib/api/with-error-capture';

async function _GET() {
  const supabase = createServerSupabaseClient();
  const { data } = await supabase.from('feature_roadmap')
    .select('id, title, description, status, created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  return NextResponse.json({ roadmap: data ?? [] });
}

export const GET = withErrorCapture('feature-roadmap', _GET);
