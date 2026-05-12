// Sentry tunnel proxy — forwards browser SDK envelopes to Sentry's ingest servers via
// our own domain. Required because tunnelRoute in withSentryConfig only configures the
// client SDK's POST target; the actual server-side handler must be created manually.
// Public route — no auth required.
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const envelope = await request.text();
    const pieces = envelope.split('\n');

    let header: { dsn?: string };
    try {
      header = JSON.parse(pieces[0]);
    } catch {
      return NextResponse.json({ error: 'invalid envelope' }, { status: 400 });
    }

    if (!header.dsn) {
      return NextResponse.json({ error: 'missing dsn' }, { status: 400 });
    }

    let dsnUrl: URL;
    try {
      dsnUrl = new URL(header.dsn);
    } catch {
      return NextResponse.json({ error: 'invalid dsn' }, { status: 400 });
    }

    // Only forward to Sentry's own ingest hosts — reject anything else
    if (!dsnUrl.hostname.endsWith('.sentry.io') && dsnUrl.hostname !== 'sentry.io') {
      return NextResponse.json({ error: 'invalid dsn host' }, { status: 400 });
    }

    const projectId = dsnUrl.pathname.substring(1);
    const publicKey = dsnUrl.username;
    const ingestUrl = `https://${dsnUrl.hostname}/api/${projectId}/envelope/`;

    const res = await fetch(ingestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
        // Sentry's ingest authenticates via the DSN public key — required to avoid 403
        'X-Sentry-Auth': `Sentry sentry_key=${publicKey}, sentry_version=7`,
      },
      body: envelope,
    });

    return NextResponse.json({}, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'tunnel error' }, { status: 500 });
  }
}
