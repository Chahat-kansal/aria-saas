export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createHmac } from 'crypto';
import { NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import Anthropic from '@anthropic-ai/sdk';
import { getAdminClient } from '@/lib/admin';

interface SentryIssue {
  id?: string;
  title?: string;
  culprit?: string;
  level?: string;
  project?: { slug?: string; name?: string };
  count?: string | number;
}

interface SentryWebhookPayload {
  action?: string;
  data?: { issue?: SentryIssue };
}

interface SentryFrame {
  filename?: string;
  function?: string;
  lineno?: number;
  context_line?: string;
}

interface SentryException {
  type?: string;
  value?: string;
  stacktrace?: { frames?: SentryFrame[] };
}

interface SentryEvent {
  exception?: { values?: SentryException[] };
}

async function runDiagnosis({
  ticketId,
  issueId,
  issue,
}: {
  ticketId: string;
  issueId: string;
  issue: SentryIssue;
}) {
  const db = getAdminClient();
  const startMs = Date.now();
  let diagnosis = '';
  let success = false;
  let errorMessage: string | undefined;
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;

  try {
    // 1. Enrich from Sentry API — latest event with stack trace
    let stackContext = '';
    const authToken = process.env.SENTRY_AUTH_TOKEN;
    if (authToken) {
      try {
        const sentryRes = await fetch(
          `https://sentry.io/api/0/issues/${issueId}/events/latest/`,
          { headers: { Authorization: `Bearer ${authToken}` } }
        );
        if (sentryRes.ok) {
          const event = await sentryRes.json() as SentryEvent;
          const exc = event.exception?.values?.[0];
          if (exc) {
            const frames = (exc.stacktrace?.frames ?? []).slice(-5);
            stackContext = [
              exc.type ? `Exception: ${exc.type}` : '',
              exc.value ? `Message: ${exc.value}` : '',
              frames.length
                ? 'Top frames:\n' + frames.map(
                    f => `  ${f.filename ?? '?'}:${f.lineno ?? '?'} in ${f.function ?? '?'}\n    ${f.context_line ?? ''}`
                  ).join('\n')
                : '',
            ].filter(Boolean).join('\n');
          }
        }
      } catch (fetchErr) {
        console.warn('[sentry/diagnosis] Sentry API fetch failed:', fetchErr instanceof Error ? fetchErr.message : fetchErr);
      }
    }

    // 2. Grounded diagnosis — only real data from Sentry, no invented details
    const anthropic = new Anthropic();
    const promptLines = [
      'You are a senior engineer diagnosing a production error from Sentry.',
      'Diagnose ONLY from the data provided below — do not invent file names, line numbers, or causes not visible in the data.',
      '',
      `Issue title: ${issue.title ?? 'Unknown'}`,
      `Level: ${issue.level ?? 'unknown'}`,
      `Project: ${issue.project?.name ?? issue.project?.slug ?? 'unknown'}`,
      `Culprit: ${issue.culprit ?? 'unknown'}`,
      `Event count: ${issue.count ?? '?'}`,
      stackContext ? `\nStack context:\n${stackContext}` : '',
      '',
      'Write 3–5 sentences: what the error is, likely root cause based on the data above, and one specific actionable fix.',
    ].filter(s => s !== undefined);

    const resp = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 512,
      messages: [{ role: 'user', content: promptLines.join('\n') }],
    });

    const textBlock = resp.content.find(b => b.type === 'text');
    diagnosis = textBlock?.type === 'text' ? textBlock.text.trim() : '';
    inputTokens = resp.usage?.input_tokens;
    outputTokens = resp.usage?.output_tokens;
    success = true;
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : String(e);
    console.error('[sentry/diagnosis] failed:', errorMessage);
    success = false;
  }

  const latencyMs = Date.now() - startMs;

  // 3. Write back in parallel — update ticket + log call
  const [updateResult, logResult] = await Promise.allSettled([
    db.from('support_tickets').update({
      aria_diagnosis: diagnosis || `Diagnosis failed: ${errorMessage ?? 'unknown error'}`,
      aria_attempted: true,
    }).eq('id', ticketId),
    db.from('aria_ai_calls').insert({
      agent_key: 'sentry_health_diagnosis',
      provider: 'anthropic',
      role: 'diagnosis',
      business_id: null,
      model_id: 'claude-sonnet-4-5-20250929',
      latency_ms: latencyMs,
      success,
      error_message: errorMessage ?? null,
      input_tokens: inputTokens ?? null,
      output_tokens: outputTokens ?? null,
      request_summary: `Sentry issue ${issueId}: ${(issue.title ?? '').slice(0, 100)}`,
      response_summary: diagnosis.slice(0, 200) || null,
    }),
  ]);

  if (updateResult.status === 'rejected') console.error('[sentry/diagnosis] ticket update failed:', updateResult.reason);
  if (logResult.status === 'rejected') console.error('[sentry/diagnosis] aria_ai_calls insert failed:', logResult.reason);

  console.log(`[sentry/diagnosis] done — ticket=${ticketId} issue=${issueId} success=${success} latency=${latencyMs}ms`);
}

export async function POST(req: Request) {
  // 1. Read RAW body first — HMAC must be computed over the exact bytes Sentry sent
  const rawBody = await req.text();

  // 2. HMAC-SHA256 verification
  const secret = process.env.SENTRY_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[sentry/webhook] SENTRY_WEBHOOK_SECRET not set — rejecting all requests');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 401 });
  }

  const signature = req.headers.get('sentry-hook-signature') ?? '';
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  if (!signature || signature !== expected) {
    console.warn('[sentry/webhook] HMAC mismatch — rejecting (possible spoofed request)');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // 3. Parse verified payload
  let payload: SentryWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as SentryWebhookPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const action = payload.action;
  const issue = payload.data?.issue;

  console.log(
    `[sentry/webhook] action=${action} issue=${issue?.id ?? 'none'}` +
    ` title="${(issue?.title ?? '').slice(0, 80)}" project=${issue?.project?.slug ?? 'none'}`
  );

  // Only create tickets for new issues (action=created)
  if (action !== 'created' || !issue?.id) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const issueId = String(issue.id);
  const categoryKey = `sentry:${issueId}`;

  const db = getAdminClient();

  // 4. Dedupe — one ticket per Sentry issue id (events can be thousands; issues are grouped)
  const { data: existing } = await db
    .from('support_tickets')
    .select('id')
    .eq('category', categoryKey)
    .maybeSingle();

  if (existing) {
    console.log(`[sentry/webhook] deduplicated — ticket already exists for issue ${issueId}`);
    return NextResponse.json({ ok: true, deduplicated: true });
  }

  // 5. Priority from level
  const level = (issue.level ?? '').toLowerCase();
  const priority = (level === 'error' || level === 'fatal') ? 'high' : 'normal';

  // 6. Build ticket fields
  const subject = `[Sentry] ${(issue.title ?? 'Unknown issue').slice(0, 200)}`;
  const projectName = issue.project?.name ?? issue.project?.slug ?? 'unknown';
  const message = [
    `Level: ${issue.level ?? 'unknown'}`,
    `Project: ${projectName}`,
    `Culprit: ${issue.culprit ?? 'unknown'}`,
    `Event count: ${issue.count ?? '?'}`,
    `Sentry issue ID: ${issueId}`,
  ].join('\n');

  // 7. AWAITED insert — get id back so runDiagnosis can update the row
  const { data: insertData, error: insertError } = await db.from('support_tickets').insert({
    business_id: null,           // platform-level health ticket; column is nullable
    user_email: 'sentry@ariaos.site',
    subject,
    message,
    status: 'open',
    priority,
    source: 'aria_health',
    category: categoryKey,       // dedupe key: sentry:<issueId>
    aria_attempted: false,
  }).select('id').single();

  if (insertError || !insertData) {
    console.error('[sentry/webhook] insert failed:', insertError?.message, insertError?.code);
    return NextResponse.json({ error: 'Failed to create ticket' }, { status: 500 });
  }

  console.log(`[sentry/webhook] ticket created for Sentry issue ${issueId} (${priority} priority)`);

  // 8. Background AI diagnosis — survives after response via waitUntil (not void)
  waitUntil(
    runDiagnosis({ ticketId: insertData.id as string, issueId, issue })
      .catch(e => console.error('[sentry/diagnosis] uncaught:', e instanceof Error ? e.message : e))
  );

  return NextResponse.json({ ok: true, issue_id: issueId });
}
