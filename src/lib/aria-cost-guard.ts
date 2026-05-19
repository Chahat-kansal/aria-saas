import { supabaseAdmin } from '@/lib/supabase-admin'

const PRICES: Record<string, { input: number; output: number; cacheRead?: number; cacheWrite?: number }> = {
  'claude-sonnet-4-5-20250929': { input: 3,    output: 15,  cacheRead: 0.30, cacheWrite: 3.75 },
  'claude-haiku-4-5-20251001':  { input: 1,    output: 5,   cacheRead: 0.10, cacheWrite: 1.25 },
  'gpt-4o-mini':                { input: 0.15, output: 0.60 },
  'gpt-4o':                     { input: 2.50, output: 10 },
  'gemini-2.5-flash-lite':      { input: 0.10, output: 0.40 },
}

export async function checkCostCeiling(businessId: string): Promise<{ ok: boolean; spent: number; ceiling: number }> {
  const dayStart = new Date()
  dayStart.setHours(0, 0, 0, 0)

  const { data: calls } = await supabaseAdmin
    .from('aria_ai_calls')
    .select('model_id,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens')
    .eq('business_id', businessId)
    .gte('created_at', dayStart.toISOString())

  let total = 0
  for (const c of calls ?? []) {
    const p = PRICES[c.model_id as string]
    if (!p) continue
    total += ((Number(c.input_tokens)  || 0) / 1e6) * p.input
    total += ((Number(c.output_tokens) || 0) / 1e6) * p.output
    if (p.cacheRead)  total += ((Number(c.cache_read_tokens)  || 0) / 1e6) * p.cacheRead
    if (p.cacheWrite) total += ((Number(c.cache_write_tokens) || 0) / 1e6) * p.cacheWrite
  }

  const ceiling = parseFloat(process.env.ARIA_DAILY_COST_CEILING ?? '5.00')
  return { ok: total < ceiling, spent: total, ceiling }
}
