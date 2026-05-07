'use client';

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = 'https://eu.posthog.com';

let _ph: typeof import('posthog-js').default | null = null;

async function getPostHog() {
  if (!POSTHOG_KEY) return null;
  if (typeof window === 'undefined') return null;
  if (_ph) return _ph;
  const { default: posthog } = await import('posthog-js');
  if (!posthog.__loaded) {
    posthog.init(POSTHOG_KEY, { api_host: POSTHOG_HOST, capture_pageview: false });
  }
  _ph = posthog;
  return posthog;
}

export async function track(event: string, properties?: Record<string, unknown>) {
  try {
    const ph = await getPostHog();
    ph?.capture(event, properties);
  } catch {
    // analytics must never throw
  }
}
