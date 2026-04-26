import { createServerSupabaseClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase';
import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const SOURCES = [
  { url: 'https://immi.homeaffairs.gov.au/news-media/latest-news', name: 'Home Affairs' },
  { url: 'https://www.mara.gov.au/news', name: 'MARA' },
];

async function scrapeUrl(url: string): Promise<string> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key || key === 'fc-your-key-here') {
    return '';
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@mendable/firecrawl-js') as Record<string, any>;
    const Cls = mod.Firecrawl ?? mod.FirecrawlAppV1 ?? mod.default;
    const app = new Cls({ apiKey: key });
    const result = await app.scrapeUrl(url, { formats: ['markdown'] });
    return result?.markdown || result?.content || '';
  } catch {
    return '';
  }
}

async function analyseContent(content: string, source: string): Promise<{
  articles: Array<{ title: string; summary: string; visa_classes: string[]; relevance: number; is_policy_change: boolean; }>
}> {
  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: `You are an Australian immigration expert. Analyse this content from ${source} and extract immigration news articles.

For each distinct news item or article found, return a JSON array with objects containing:
- title: string (article headline)
- summary: string (2-3 sentence plain English summary)
- visa_classes: string[] (array of visa subclass numbers mentioned, e.g. ["482", "189"])
- relevance: number (1-10, how relevant to migration agents)
- is_policy_change: boolean (true if this is a policy/law change)

Return ONLY a valid JSON array. If no articles found, return [].

Content:
${content.slice(0, 8000)}`,
    }],
  });

  try {
    const text = (msg.content[0] as any).text;
    const json = text.match(/\[[\s\S]*\]/)?.[0];
    return { articles: json ? JSON.parse(json) : [] };
  } catch {
    return { articles: [] };
  }
}

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let saved = 0;
  let alertsCreated = 0;

  for (const source of SOURCES) {
    try {
      const content = await scrapeUrl(source.url);
      if (!content) continue;

      const { articles } = await analyseContent(content, source.name);

      for (const article of articles) {
        if (!article.title || article.relevance < 4) continue;

        const { data: existing } = await (supabaseAdmin || supabase)
          .from('immigration_news')
          .select('id')
          .eq('title', article.title)
          .single();

        if (existing) continue;

        await (supabaseAdmin || supabase).from('immigration_news').insert({
          title: article.title,
          summary: article.summary,
          source: source.name,
          source_url: source.url,
          published_at: new Date().toISOString(),
          visa_classes_mentioned: article.visa_classes,
          relevance_score: article.relevance,
        });
        saved++;

        if (article.relevance >= 7 && article.is_policy_change) {
          const { data: affectedClients } = await supabase
            .from('visa_clients')
            .select('id')
            .eq('agent_id', user.id)
            .in('visa_type', article.visa_classes.map((v: string) => `%${v}%`));

          await (supabaseAdmin || supabase).from('immigration_alerts').insert({
            agent_id: user.id,
            title: article.title,
            description: article.summary,
            source_url: source.url,
            visa_classes_affected: article.visa_classes,
            severity: article.relevance >= 9 ? 'critical' : article.relevance >= 7 ? 'high' : 'medium',
            affected_client_ids: (affectedClients || []).map((c: any) => c.id),
            is_read: false,
          });
          alertsCreated++;
        }
      }
    } catch {}
  }

  return NextResponse.json({ saved, alertsCreated, message: `Scanned ${SOURCES.length} sources` });
}

export async function GET() {
  return NextResponse.json({ sources: SOURCES.map(s => s.name), status: 'ready' });
}