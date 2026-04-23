import { createServerSupabaseClient } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

export async function GET() {
  const results: Record<string, unknown> = {};

  // 1. Auth check
  try {
    const supabase = createServerSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    results.auth = user ? { ok: true, userId: user.id, email: user.email } : { ok: false, error: error?.message ?? 'No user' };
  } catch (e: any) {
    results.auth = { ok: false, error: e.message };
  }

  // 2. Anthropic key check
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 16,
      messages: [{ role: 'user', content: 'Say "ok"' }],
    });
    results.anthropic = { ok: true, reply: (msg.content[0] as any).text };
  } catch (e: any) {
    results.anthropic = { ok: false, error: e.message };
  }

  // 3. Env vars
  results.env = {
    ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
    NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };

  return NextResponse.json(results, { status: 200 });
}