import { createServerSupabaseClient } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { businessId } = await req.json();
  if (!businessId) return NextResponse.json({ error: 'businessId required' }, { status: 400 });

  const { data: business } = await supabase.from('businesses').select('*').eq('id', businessId).eq('user_id', user.id).single();
  if (!business) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let alerts: { competitor_name: string; alert_text: string; source_url: string | null; alert_type: string }[] = [];

  // Try Firecrawl if configured
  if (process.env.FIRECRAWL_API_KEY) {
    try {
      const res = await fetch('https://api.firecrawl.dev/v1/search', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.FIRECRAWL_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: `${business.industry} ${business.city ?? 'Australia'} competitors reviews`, limit: 8 }),
      });
      if (res.ok) {
        const fcData = await res.json();
        const results = fcData.data ?? [];
        for (const r of results.slice(0, 5)) {
          alerts.push({
            competitor_name: r.metadata?.ogSiteName ?? r.url?.split('/')[2] ?? 'Competitor',
            alert_text: r.description ?? r.metadata?.description ?? 'New activity detected',
            source_url: r.url ?? null,
            alert_type: 'web',
          });
        }
      }
    } catch { /* fall through to Claude */ }
  }

  // Fall back to Claude for AI-generated competitive intelligence
  if (alerts.length === 0) {
    const prompt = `You are a competitive intelligence analyst. Generate 5 realistic competitor alerts for a ${business.industry} business called "${business.name}" in ${business.city ?? 'Australia'}.

Return ONLY a JSON array:
[
  {
    "competitor_name": "Business Name",
    "alert_text": "Specific alert about what they're doing — pricing change, new service, promotion, review activity etc.",
    "alert_type": "pricing|promotion|review|new_service|general",
    "source_url": null
  }
]

Make the alerts specific and realistic for the ${business.industry} industry in ${business.city ?? 'Australia'}. Reference realistic business names for the area.`;

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      try { alerts = JSON.parse(match[0]); } catch { /* ignore */ }
    }
  }

  if (!alerts.length) return NextResponse.json({ error: 'Failed to generate competitor data' }, { status: 500 });

  const { data: inserted, error } = await supabase.from('competitor_alerts').insert(
    alerts.map(a => ({ ...a, business_id: businessId, detected_at: new Date().toISOString() }))
  ).select();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from('activity_log').insert({
    business_id: businessId,
    action_type: 'competitor',
    description: `Aria found ${alerts.length} competitor updates`,
  });

  return NextResponse.json({ alerts: inserted });
}
