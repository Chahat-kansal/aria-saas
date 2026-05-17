export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 20;

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { parseLLMJsonOr } from '@/lib/ai-json';
import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { trackAICall } from '@/lib/aria/ai-telemetry'
import { getBusinessContext, hasEnoughData } from '@/lib/aria/get-business-context'
import { getSystemPrompt } from '@/lib/aria/get-system-prompt'
import { writeAriaOutcome } from '@/lib/aria/write-outcome'

async function getBid(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  userId: string,
): Promise<string | null> {
  const { data: active } = await supabase
    .from('user_active_business')
    .select('business_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (active?.business_id) return active.business_id as string;
  const { data } = await supabase
    .from('businesses')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

interface NarrativeEntry {
  time: string;
  icon: string;
  narrative: string;
  link: string | null;
}

interface RawEvent {
  ts: number;
  time: string;
  icon: string;
  narrative: string;
  link: string | null;
}

// Per-business in-memory cache — prevents hammering Anthropic on every page load
const _narrativeCache = new Map<string, { payload: unknown; ts: number }>();
const NARRATIVE_CACHE_MS = 5 * 60 * 1000; // 5 minutes

// Row shapes
interface ActivityRow {
  action_type: string | null;
  description: string | null;
  created_at: string | null;
}

interface SaleRow {
  id: string | null;
  total_amount: number | null;
  payment_method: string | null;
  created_at: string | null;
}

interface StockMovementRow {
  item_id: string | null;
  movement_type: string | null;
  quantity_added: number | null;
  new_stock: number | null;
  notes: string | null;
  scanned_at: string | null;
}

interface ReviewRow {
  rating: number | null;
  created_at: string | null;
}

type SafeResult<T> = { data: T[] | null; error: Error | null };

function fallback<T>(): SafeResult<T> {
  return { data: null, error: new Error('fetch failed') };
}

function toHHMM(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '00:00';
  return d.toLocaleTimeString('en-AU', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Australia/Sydney',
  });
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const businessId =
    searchParams.get('business_id') ?? (await getBid(supabase, user.id));
  if (!businessId) {
    return NextResponse.json({ error: 'No active business found' }, { status: 404 });
  }

  // Return cached response if fresh (5-min TTL per business)
  const cached = _narrativeCache.get(businessId);
  if (cached && Date.now() - cached.ts < NARRATIVE_CACHE_MS) {
    return NextResponse.json(cached.payload);
  }

  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString();

  // Fetch all four data sources in parallel (each wrapped to avoid PromiseLike .catch issues)
  const [activityResult, salesResult, stockResult, reviewsResult] =
    await Promise.all([
      (async (): Promise<SafeResult<ActivityRow>> => {
        try {
          const r = await supabase.from('activity_log').select('action_type, description, created_at')
            .eq('business_id', businessId).order('created_at', { ascending: false }).limit(20);
          return { data: (r.data ?? null) as ActivityRow[] | null, error: r.error };
        } catch { return fallback<ActivityRow>(); }
      })(),
      (async (): Promise<SafeResult<SaleRow>> => {
        try {
          const r = await supabase.from('pos_sales').select('id, total_amount, payment_method, created_at')
            .eq('business_id', businessId).eq('status', 'completed').gte('created_at', threeHoursAgo)
            .order('created_at', { ascending: false }).limit(10);
          return { data: (r.data ?? null) as SaleRow[] | null, error: r.error };
        } catch { return fallback<SaleRow>(); }
      })(),
      (async (): Promise<SafeResult<StockMovementRow>> => {
        try {
          const r = await supabase.from('stock_movements')
            .select('item_id, movement_type, quantity_added, new_stock, notes, scanned_at')
            .eq('business_id', businessId).gte('scanned_at', twentyFourHoursAgo)
            .order('scanned_at', { ascending: false }).limit(10);
          return { data: (r.data ?? null) as StockMovementRow[] | null, error: r.error };
        } catch { return fallback<StockMovementRow>(); }
      })(),
      (async (): Promise<SafeResult<ReviewRow>> => {
        try {
          const r = await supabase.from('reviews').select('rating, created_at')
            .eq('business_id', businessId).gte('created_at', twentyFourHoursAgo)
            .order('created_at', { ascending: false }).limit(5);
          return { data: (r.data ?? null) as ReviewRow[] | null, error: r.error };
        } catch { return fallback<ReviewRow>(); }
      })(),
    ]);

  // Build raw events array
  const rawEvents: RawEvent[] = [];

  // Activity log events
  if (!activityResult.error && activityResult.data) {
    for (const row of activityResult.data) {
      if (!row.created_at) continue;
      rawEvents.push({
        ts: new Date(row.created_at).getTime(),
        time: toHHMM(row.created_at),
        icon: '📊',
        narrative: row.description ?? row.action_type ?? 'Activity logged',
        link: null,
      });
    }
  }

  // POS sales events
  if (!salesResult.error && salesResult.data) {
    for (const row of salesResult.data) {
      if (!row.created_at) continue;
      const amount = row.total_amount ?? 0;
      const method = row.payment_method ?? 'unknown';
      rawEvents.push({
        ts: new Date(row.created_at).getTime(),
        time: toHHMM(row.created_at),
        icon: '💰',
        narrative: `Sale of A$${amount.toFixed(2)} via ${method}`,
        link: null,
      });
    }
  }

  // Stock movement events
  if (!stockResult.error && stockResult.data) {
    for (const row of stockResult.data) {
      const dateStr = row.scanned_at;
      if (!dateStr) continue;
      const qty = row.quantity_added ?? 0;
      const newStock = row.new_stock ?? 0;
      const movType = row.movement_type ?? 'movement';
      const notePart = row.notes ? ` — ${row.notes}` : '';
      rawEvents.push({
        ts: new Date(dateStr).getTime(),
        time: toHHMM(dateStr),
        icon: '📦',
        narrative: `Stock ${movType}: ${qty > 0 ? '+' : ''}${qty} units (now ${newStock} in stock)${notePart}`,
        link: null,
      });
    }
  }

  // Review events
  if (!reviewsResult.error && reviewsResult.data) {
    for (const row of reviewsResult.data) {
      if (!row.created_at) continue;
      const rating = row.rating ?? 0;
      const stars = '★'.repeat(Math.max(0, Math.min(5, rating)));
      rawEvents.push({
        ts: new Date(row.created_at).getTime(),
        time: toHHMM(row.created_at),
        icon: '⭐',
        narrative: `New ${row.rating ?? '?'}-star review received ${stars}`,
        link: '/reviews',
      });
    }
  }

  // Sort descending by timestamp
  rawEvents.sort((a: RawEvent, b: RawEvent) => b.ts - a.ts);

  const generatedAt = now.toISOString();

  // No events at all — return empty
  if (rawEvents.length === 0) {
    return NextResponse.json({ events: [], generated_at: generatedAt });
  }

  // Format raw fallback entries
  const fallbackEntries: NarrativeEntry[] = rawEvents.slice(0, 8).map(
    (e: RawEvent): NarrativeEntry => ({
      time: e.time,
      icon: e.icon,
      narrative: e.narrative,
      link: e.link,
    }),
  );

  // Try AI narrative if key is set and we have enough events
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey && rawEvents.length >= 3) {
    try {
      const anthropic = new Anthropic({ apiKey });
      const eventsJson = JSON.stringify(
        rawEvents.slice(0, 20).map((e: RawEvent) => ({
          time: e.time,
          icon: e.icon,
          description: e.narrative,
        })),
        null,
        2,
      );

      const _bizCtx = await getBusinessContext(businessId)
  const _industry = (JSON.parse(_bizCtx))?.business?.industry ?? 'retail'
  const systemPrompt = getSystemPrompt(_industry as string, _bizCtx)
  const response = 
await trackAICall({ route: 'aria/activity-narrative', model: 'claude-sonnet-4-5-20250929', businessId: businessId, purpose: 'activity-narrative' }, () => anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 400,
        system: [{ type: 'text' as const, text: systemPrompt, cache_control: { type: 'ephemeral' as const } }],
        messages: [
          {
            role: 'user',
            content: `Business events (last 24h):\n${eventsJson}\n\nReturn JSON array of up to 8 entries: [{"time": "HH:MM", "icon": "emoji", "narrative": "one friendly sentence", "link": "/path or null"}]`,
          },
        ],
      }));

      const textBlock = response.content.find((b) => b.type === 'text');
      if (textBlock && textBlock.type === 'text') {
        const rawText = textBlock.text.trim();
        // Extract JSON array, handle optional markdown code fences
        const parsed = parseLLMJsonOr<Array<{ time: unknown; icon: unknown; narrative: unknown; link: unknown }>>(
          rawText, [], 'activity-narrative', 'array'
        );
        if (parsed.length > 0) {
          const aiEntries: NarrativeEntry[] = parsed.map(
            (item): NarrativeEntry => ({
              time: typeof item.time === 'string' ? item.time : '00:00',
              icon: typeof item.icon === 'string' ? item.icon : '📊',
              narrative: typeof item.narrative === 'string' ? item.narrative : '',
              link: typeof item.link === 'string' ? item.link : null,
            }),
          );
          const aiPayload = { events: aiEntries, generated_at: generatedAt };
          _narrativeCache.set(businessId, { payload: aiPayload, ts: Date.now() });
          return NextResponse.json(aiPayload);
        }
      }
    } catch {
      // Fall through to raw events below
    }
  }

  const fallbackPayload = { events: fallbackEntries, generated_at: generatedAt };
  _narrativeCache.set(businessId, { payload: fallbackPayload, ts: Date.now() });
  return NextResponse.json(fallbackPayload);
}

export const GET = withErrorCapture('aria/activity-narrative', _GET)
