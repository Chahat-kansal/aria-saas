import { createServerSupabaseClient } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { jobDescription, businessId } = await req.json();
  if (!jobDescription || !businessId) return NextResponse.json({ error: 'jobDescription and businessId required' }, { status: 400 });

  const { data: business } = await supabase
    .from('businesses')
    .select('*')
    .eq('id', businessId)
    .eq('user_id', session.user.id)
    .single();

  if (!business) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (business.plan !== 'pro') return NextResponse.json({ error: 'Quote builder requires Pro plan' }, { status: 403 });

  const prompt = `Generate a professional quote for a ${business.industry} business called "${business.name}".

Job description: ${jobDescription}

Return a JSON object with this exact structure:
{
  "quoteNumber": "Q-${Date.now().toString().slice(-6)}",
  "businessName": "${business.name}",
  "date": "${new Date().toLocaleDateString('en-AU')}",
  "validUntil": "${new Date(Date.now() + 30 * 86400000).toLocaleDateString('en-AU')}",
  "lineItems": [
    { "description": "item description", "qty": 1, "rate": 0, "total": 0 }
  ],
  "subtotal": 0,
  "gst": 0,
  "total": 0,
  "notes": "payment terms and any notes",
  "terms": "standard terms"
}
Use realistic Australian pricing for the industry. Return ONLY the JSON.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON returned');

    const quote = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ quote });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}