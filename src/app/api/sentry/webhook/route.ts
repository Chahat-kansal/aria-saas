export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { createHmac } from 'crypto';
import { NextResponse } from 'next/server';
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

  // 7. AWAITED insert — void kills it on serverless teardown
  const { error: insertError } = await db.from('support_tickets').insert({
    business_id: null,           // platform-level health ticket; column is nullable
    user_email: 'sentry@ariaos.site',
    subject,
    message,
    status: 'open',
    priority,
    source: 'aria_health',
    category: categoryKey,       // dedupe key: sentry:<issueId>
    aria_attempted: false,
  });

  if (insertError) {
    console.error('[sentry/webhook] insert failed:', insertError.message, insertError.code);
    return NextResponse.json({ error: 'Failed to create ticket' }, { status: 500 });
  }

  console.log(`[sentry/webhook] ticket created for Sentry issue ${issueId} (${priority} priority)`);
  return NextResponse.json({ ok: true, issue_id: issueId });
}
