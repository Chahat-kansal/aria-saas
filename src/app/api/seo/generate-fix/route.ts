export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { waitUntil } from '@vercel/functions';
import { withErrorCapture } from '@/lib/api/with-error-capture';
import { trackAICall } from '@/lib/aria/ai-telemetry';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-sonnet-4-5-20250929';

const SYSTEM = `You are an SEO expert assistant. Follow the instructions exactly.
Rules:
- Never invent facts not provided to you.
- Obey character limits precisely.
- Output ONLY the fix itself — no preamble, no explanation, no markdown wrappers.
- For JSON-LD output, produce valid JSON only.`;

function buildPrompt(
  issueType: string,
  issue: { page_url: string; detail: string },
  page: { title: string | null; word_count: number | null } | null,
  biz: { name: string | null; city: string | null; industry: string | null; address: string | null; phone: string | null; abn: string | null }
): { prompt: string; fixFormat: string } {
  const bizName = biz.name ?? 'the business';
  const city = biz.city ?? 'Australia';

  switch (issueType) {
    case 'missing_meta_description': {
      const pageTitle = page?.title ?? '';
      const wordCount = page?.word_count ?? 0;
      return {
        fixFormat: 'meta_tag',
        prompt: `Write a meta description for a web page.

Business: ${bizName}, located in ${city}.
Page title: "${pageTitle}"
Approximate word count of page: ${wordCount}
Page URL: ${issue.page_url}

Requirements:
- Between 150 and 160 characters (count carefully)
- Plain text only, no HTML
- Include the business name and city
- Describe what's on the page based on its title

Good example (155 chars): "Melbourne's favourite bakery offering fresh sourdough, pastries and custom cakes. Visit Wild Grain in Fitzroy for handcrafted bread baked daily."
Bad example (too short, vague): "Welcome to our website."

Output only the description text, nothing else.`,
      };
    }

    case 'missing_title': {
      return {
        fixFormat: 'meta_tag',
        prompt: `Write a page title tag for a web page.

Business: ${bizName}, located in ${city}.
Industry: ${biz.industry ?? 'small business'}
Page URL: ${issue.page_url}

Requirements:
- Between 50 and 60 characters (count carefully)
- Include the business name
- Be descriptive and specific to the page

Good example (58 chars): "Custom Wedding Cakes Melbourne | Wild Grain Bakery"
Bad example (too long, stuffed): "Best Custom Wedding Cakes in Melbourne Victoria Australia CBD | Wild Grain Bakery Fitzroy"

Output only the title text, nothing else.`,
      };
    }

    case 'missing_alt_text': {
      return {
        fixFormat: 'guidance',
        prompt: `Write alt text guidance for a ${biz.industry ?? 'small business'} website.

Business: ${bizName}
Page: ${issue.page_url}

Provide:
1. One short rule for writing good alt text (1 sentence)
2. Two concrete examples specific to this business type

Format:
Rule: [rule]
Good alt: [example 1]
Good alt: [example 2]

Good example style: "alt='Fresh sourdough loaves cooling on a wooden rack at Wild Grain Bakery'"
Bad example style: "alt='image1'" or "alt='photo'"

Output only the rule and two examples in the format above.`,
      };
    }

    case 'missing_schema': {
      const addr = biz.address ?? '';
      const phone = biz.phone ?? '';
      return {
        fixFormat: 'jsonld',
        prompt: `Generate a LocalBusiness JSON-LD schema block for this business.

Business name: ${bizName}
Address: ${addr}
City: ${city}
Phone: ${phone}
Industry: ${biz.industry ?? 'LocalBusiness'}
ABN: ${biz.abn ?? ''}

Requirements:
- Valid JSON only, no code fences, no comments
- Use @type LocalBusiness (or a more specific type if industry matches, e.g. Restaurant, Bakery)
- Include @context, @type, name, address (PostalAddress), telephone, areaServed
- Only include fields you have data for — do not invent values

Good example: {"@context":"https://schema.org","@type":"Bakery","name":"Wild Grain","address":{"@type":"PostalAddress","streetAddress":"123 Smith St","addressLocality":"Fitzroy","addressRegion":"VIC","addressCountry":"AU"},"telephone":"+61312345678","areaServed":"Melbourne"}
Bad example: {"@type":"LocalBusiness","name":"Business","address":"unknown"}

Output only the JSON object.`,
      };
    }

    case 'slow_page': {
      return {
        fixFormat: 'guidance',
        prompt: `Provide actionable advice for fixing a slow web page.

Page URL: ${issue.page_url}
Issue: ${issue.detail}

Give 3 specific, prioritised actions to improve page speed.
Use plain text bullet points.
Be specific — avoid generic advice.

Output only the 3 bullet points.`,
      };
    }

    case 'broken_link': {
      return {
        fixFormat: 'guidance',
        prompt: `Provide actionable advice for fixing a broken internal link (404).

Page URL: ${issue.page_url}
Issue: ${issue.detail}

Give 2 specific steps: (1) how to find where the broken link is used, (2) whether to fix or remove it.
Use plain text.

Output only the 2 steps.`,
      };
    }

    case 'thin_content': {
      return {
        fixFormat: 'guidance',
        prompt: `Provide advice for improving thin content on a ${biz.industry ?? 'business'} web page.

Page URL: ${issue.page_url}
Issue: ${issue.detail}
Business: ${bizName} in ${city}

Give 3 specific content improvement suggestions relevant to this business type.
Use plain text bullet points.

Output only the 3 bullet points.`,
      };
    }

    default: {
      return {
        fixFormat: 'guidance',
        prompt: `Provide a concise fix recommendation for this SEO issue.

Issue: ${issue.detail}
Page: ${issue.page_url}
Business: ${bizName}

Give 2-3 specific action steps in plain text bullet points.

Output only the bullet points.`,
      };
    }
  }
}

async function _POST(req: Request): Promise<Response> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI not configured' }, { status: 503 });
  }

  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { issue_id?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }

  const { issue_id } = body;
  if (!issue_id) return NextResponse.json({ error: 'issue_id required' }, { status: 400 });

  // Load issue
  const { data: issue } = await supabase
    .from('seo_issues')
    .select('id, business_id, page_url, issue_type, severity, title, detail')
    .eq('id', issue_id)
    .maybeSingle();

  if (!issue) return NextResponse.json({ error: 'Issue not found' }, { status: 404 });

  // RLS-safe ownership check
  const { data: biz } = await supabase
    .from('businesses')
    .select('id, name, city, industry, address, phone, abn')
    .eq('id', issue.business_id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Load seo_pages row for context
  const { data: page } = await supabase
    .from('seo_pages')
    .select('title, word_count')
    .eq('business_id', issue.business_id)
    .eq('url', issue.page_url)
    .order('crawled_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { prompt, fixFormat } = buildPrompt(issue.issue_type, issue, page, biz);

  const msg = await trackAICall(
    { route: 'seo/generate-fix', model: MODEL, businessId: biz.id, purpose: 'seo_fix' },
    () => anthropic.messages.create({
      model: MODEL,
      max_tokens: 512,
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    })
  );

  const suggestedFix = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '';

  // Update seo_issues
  await supabase
    .from('seo_issues')
    .update({ suggested_fix: suggestedFix, fix_format: fixFormat, state: 'suggested' })
    .eq('id', issue_id);

  // Log to aria_ai_calls
  waitUntil((async () => {
    try {
      await supabaseAdmin.from('aria_ai_calls').insert({
        business_id: biz.id,
        agent_key: 'seo/generate-fix',
        model_id: MODEL,
        request_summary: 'seo_fix',
        input_tokens: msg.usage.input_tokens,
        output_tokens: msg.usage.output_tokens,
        success: true,
      });
    } catch (e) { console.error('[non-fatal]', e) }
  })());

  return NextResponse.json({ suggested_fix: suggestedFix, fix_format: fixFormat });
}

async function _PATCH(req: Request): Promise<Response> {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { issue_id?: string; action?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }

  const { issue_id, action } = body;
  if (!issue_id || action !== 'mark_applied') {
    return NextResponse.json({ error: 'issue_id and action:mark_applied required' }, { status: 400 });
  }

  // Load issue
  const { data: issue } = await supabase
    .from('seo_issues')
    .select('id, business_id')
    .eq('id', issue_id)
    .maybeSingle();

  if (!issue) return NextResponse.json({ error: 'Issue not found' }, { status: 404 });

  // RLS-safe ownership check
  const { data: biz } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', issue.business_id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  await supabase
    .from('seo_issues')
    .update({ state: 'applied', applied_at: new Date().toISOString() })
    .eq('id', issue_id);

  return NextResponse.json({ ok: true });
}

export const POST = withErrorCapture('seo/generate-fix', _POST);
export const PATCH = withErrorCapture('seo/generate-fix', _PATCH);
