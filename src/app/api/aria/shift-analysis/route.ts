export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { withErrorCapture } from '@/lib/api/with-error-capture';

interface Sale { total_amount: number | null; created_at: string; status: string | null }

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle();
  return data?.id ?? null;
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 });

  const { report_id } = await req.json();
  if (!report_id) return NextResponse.json({ error: 'report_id required' }, { status: 400 });

  const { data: report } = await supabase.from('pos_shift_reports')
    .select('*').eq('id', report_id).eq('business_id', bid).maybeSingle();
  if (!report) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // Hourly breakdown of revenue within the shift
  const { data: sales } = await supabase.from('pos_sales')
    .select('total_amount, created_at, status')
    .eq('business_id', bid)
    .gte('created_at', report.shift_start)
    .lte('created_at', report.shift_end);

  const validSales = ((sales ?? []) as Sale[]).filter(s => s.status !== 'voided');
  const hourly: Record<string, number> = {};
  for (const s of validSales) {
    const h = new Date(s.created_at).toISOString().slice(11, 13);
    hourly[h] = (hourly[h] ?? 0) + Math.max(0, Number(s.total_amount ?? 0));
  }

  const staffCount = (report.staff_on_shift as Array<{ name: string; hours: number | null }> ?? []).length;
  const totalHours = (report.staff_on_shift as Array<{ name: string; hours: number | null }> ?? []).reduce((a, s) => a + Number(s.hours ?? 0), 0);

  let analysis = '';
  let inputTokens = 0, outputTokens = 0, success = false;
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 });
    const res = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      temperature: 0.3,
      system: 'You are a labour productivity analyst for an Australian small business. Identify overstaffed/understaffed windows, peak revenue gaps, and one specific action. Plain prose, max 4 short sentences.',
      messages: [{ role: 'user', content: `Shift ${report.shift_start} → ${report.shift_end}\nStaff on shift: ${staffCount} (${totalHours.toFixed(1)} hrs)\nRevenue: A$${Number(report.total_revenue ?? 0).toFixed(2)}\nTransactions: ${report.total_transactions}\nHourly revenue breakdown: ${JSON.stringify(hourly)}\nTop products: ${JSON.stringify(report.top_products)}\n\nAnalyse this shift's labour efficiency.` }],
    });
    analysis = res.content.filter((b: { type: string; text?: string }) => b.type === 'text').map((b: { type: string; text?: string }) => b.text ?? '').join('').trim();
    inputTokens = res.usage.input_tokens;
    outputTokens = res.usage.output_tokens;
    success = true;
  } catch (e) { console.error('[shift-analysis] AI failed:', (e as Error).message); }

  void (async () => {
    try {
      await supabaseAdmin.from('aria_ai_calls').insert({
        business_id: bid, agent_key: 'shift_analysis', provider: 'anthropic',
        model_id: 'claude-haiku-4-5-20251001', role: 'analysis',
        input_tokens: inputTokens, output_tokens: outputTokens, success,
      });
    } catch { /* non-fatal */ }
  })();

  return NextResponse.json({ analysis, hourly_revenue: hourly, staff_count: staffCount, total_hours: totalHours });
}

export const POST = withErrorCapture('aria/shift-analysis', _POST);
