import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'crypto';

const client = new Anthropic();

export interface InsightResult {
  bullets: string[];
  generated_at: string;
}

interface InsightOpts {
  business_id: string;
  context: string;
  data: unknown;
  maxBullets?: number;
  realtime?: boolean;
  style?: 'concise' | 'narrative';
}

const SYSTEM = `You are Aria, an AI advisor for an Australian retail business (focus: liquor/bottle shops). Be specific, use numbers from the data, max 20 words per bullet, Australian English (no z's). Reference exact figures, dates, names where present. Tone: confident, not corporate. Like a sharp friend who knows retail, not a consultant.

Each bullet MUST contain:
1. A specific observation with a number.
2. The implication or recommended action.

Examples of GOOD bullets:
"Carlton Dry earned $2,840 last month — your #1 earner, consider featuring it in promotions."
"Dead stock worth $4,200 is tying up cash — run a clearance before end of quarter."

Examples of BAD bullets (too vague, never produce these):
"Consider reviewing your inventory levels."
"Sales performance shows mixed results across categories."

Return ONLY valid JSON: {"bullets": ["...", "..."]}. No preamble. No markdown. No code fences.`;

// Extracts the key metrics that determine insight quality so the cache busts
// when meaningful data changes (new sale, stock change) but not on noise.
function dataFingerprint(data: unknown): string {
  const d = (data ?? {}) as Record<string, unknown>;
  const topProds = (d.top_products ?? d.topProducts) as Array<{ name?: string }> | undefined;
  return JSON.stringify({
    total: Math.round(Number(d.total_revenue ?? d.revenue ?? d.total_transactions ?? d.count ?? 0)),
    top: String(topProds?.[0]?.name ?? d.top_cashier ?? ''),
    count: Number(d.row_count ?? d.count ?? (d.items as unknown[] | undefined)?.length ?? 0),
  });
}

function cacheKey(business_id: string, context: string, data: unknown): string {
  const raw = business_id + context + dataFingerprint(data);
  return createHash('sha256').update(raw).digest('hex');
}

function extractJson(raw: string): { bullets?: unknown[] } {
  let cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }
  return JSON.parse(cleaned);
}

const FALLBACK: InsightResult = {
  bullets: ['Insights temporarily unavailable.', 'Try refresh.'],
  generated_at: new Date().toISOString(),
};

export async function generateInsight(opts: InsightOpts): Promise<InsightResult> {
  const { business_id, context, data, maxBullets = 2, realtime = false } = opts;

  const hash = cacheKey(business_id, context, data);

  if (!realtime) {
    try {
      const { createServerSupabaseClient } = await import('@/lib/supabase-server');
      const supabase = createServerSupabaseClient();
      const { data: cached } = await supabase
        .from('aria_insights_cache')
        .select('bullets, created_at')
        .eq('business_id', business_id)
        .eq('context_hash', hash)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();
      if (cached) {
        return { bullets: cached.bullets as string[], generated_at: cached.created_at };
      }
    } catch {}
  }

  try {
    const dataStr = JSON.stringify(data);
    const truncated = dataStr.length > 2048 ? dataStr.slice(0, 2048) + '…' : dataStr;

    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: `Context: ${context}\nMax bullets: ${maxBullets}\nData: ${truncated}`,
      }],
    });

    const text = msg.content[0]?.type === 'text' ? msg.content[0].text : '';

    let result: InsightResult;
    try {
      const parsed = extractJson(text);
      result = {
        bullets: Array.isArray(parsed?.bullets)
          ? (parsed.bullets as unknown[]).filter(b => typeof b === 'string').slice(0, maxBullets) as string[]
          : [text.slice(0, 120)],
        generated_at: new Date().toISOString(),
      };
    } catch {
      console.warn('[aria-insights] parse failed, using raw text');
      result = { bullets: [text.slice(0, 120)], generated_at: new Date().toISOString() };
    }

    try {
      const { createServerSupabaseClient } = await import('@/lib/supabase-server');
      const supabase = createServerSupabaseClient();
      const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      await supabase.from('aria_insights_cache').upsert({
        business_id,
        context_hash: hash,
        bullets: result.bullets,
        expires_at: expires,
      }, { onConflict: 'business_id,context_hash' });
    } catch {}

    return result;
  } catch (e) {
    console.warn('[aria-insights] error:', e);
    return FALLBACK;
  }
}
