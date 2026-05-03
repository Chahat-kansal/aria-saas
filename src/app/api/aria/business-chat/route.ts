import { createServerSupabaseClient } from '@/lib/supabase-server';
import { collectBusinessData } from '@/lib/aria/business-data';
import { chatWithBusinessBrain } from '@/lib/aria/business-brain';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function formatAnswer(output: Awaited<ReturnType<typeof chatWithBusinessBrain>>) {
  const parts = [output.summary];

  if (output.missing_data.length > 0) {
    parts.push(`Missing data: ${output.missing_data.join(', ')}.`);
    if (output.onboarding_guidance) parts.push(output.onboarding_guidance);
    return parts.filter(Boolean).join('\n\n');
  }

  if (output.observations.length > 0) {
    parts.push(output.observations.slice(0, 3).map(obs => {
      const evidence = obs.evidence.length ? ` Evidence: ${obs.evidence.join(' ')}` : '';
      return `${obs.title}: ${obs.what_happened} ${obs.what_it_means}${evidence}`;
    }).join('\n\n'));
  }

  if (output.recommendations.length > 0) {
    parts.push(output.recommendations.slice(0, 4).map(rec => {
      const evidence = rec.evidence.length ? ` Evidence: ${rec.evidence.join(' ')}` : '';
      return `Recommended action: ${rec.recommendation}\nWhy: ${rec.reason}\nExpected impact: ${rec.expected_impact}\nRisk if ignored: ${rec.risk_if_ignored}\nConfidence: ${rec.confidence}.${evidence}`;
    }).join('\n\n'));
  }

  return parts.filter(Boolean).join('\n\n');
}

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const { message, conversation_history = [], business_id } = await req.json().catch(() => ({}));
  if (!message?.trim()) return new Response(JSON.stringify({ error: 'message required' }), { status: 400 });
  if (!business_id) return new Response(JSON.stringify({ error: 'business_id required' }), { status: 400 });

  // Detect feature requests — route to feature-builder
  const FEATURE_REQUEST_PATTERNS = [
    /add a feature/i, /can you add/i, /i want to track/i, /i want to add/i,
    /create a feature/i, /build a feature/i, /i need a way to/i,
    /is there a way to add/i, /can aria add/i, /add.*to.*pos/i,
    /build.*for me/i, /add.*feature/i, /custom.*feature/i,
  ];
  const isFeatureRequest = FEATURE_REQUEST_PATTERNS.some(p => p.test(message));

  const encoder = new TextEncoder();

  if (isFeatureRequest) {
    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: object) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        try {
          const origin = (req.headers.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? '');
          const analyseRes = await fetch(`${origin}/api/aria/feature-builder`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': req.headers.get('cookie') ?? '' },
            body: JSON.stringify({ business_id, feature_request: message, phase: 'analyse' }),
          });
          const analysis = await analyseRes.json().catch(() => null);
          if (analysis?.feasible !== undefined) {
            const responseText = analysis.feasible
              ? `✦ **Custom Feature Request Detected**\n\n${analysis.summary}\n\n**Complexity:** ${analysis.complexity}\n\n${analysis.questions?.length > 0 ? `Before I build this, I need to ask:\n${analysis.questions.map((q: string) => `• ${q}`).join('\n')}\n\n` : ''}${analysis.feasible ? '**Ready to build?** Go to [Custom Features](/dashboard/custom-features) and ask me to build: _"' + message + '"_' : 'This feature would require significant changes. Let me suggest alternatives...'}`
              : `I can help with that concept, but it would need custom development. ${analysis.summary}`;
            send({ text: responseText, feature_request: true, analysis });
          } else {
            send({ text: `✦ I can build custom features for your POS! Go to [Custom Features](/dashboard/custom-features) to get started, or tell me more about what you want.` });
          }
        } catch {
          send({ text: `✦ That sounds like a custom feature request. Visit [Custom Features](/dashboard/custom-features) to have Aria design and build it for you.` });
        }
        send({ done: true });
        controller.close();
      },
    });
    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' } });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      try {
        const businessData = await collectBusinessData(business_id, { userId: user.id, supabase });
        if (!businessData.business) {
          send({ error: 'Business not found' });
          send({ done: true });
          return;
        }

        const output = await chatWithBusinessBrain(businessData, {
          message,
          conversation_history: Array.isArray(conversation_history) ? conversation_history.slice(-10) : [],
        });

        send({ text: formatAnswer(output) });
        send({ done: true });
      } catch (error) {
        console.error('[aria/business-chat] failed', error);
        send({ error: 'Aria could not answer from business data right now.' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
