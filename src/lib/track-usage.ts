import { createClient } from '@supabase/supabase-js';

export function trackUsage(params: {
  business_id: string;
  event_type: string;
  metadata?: object;
}): void {
  // Fire and forget — never awaited, never throws
  try {
    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    void db.from('usage_logs').insert({
      business_id: params.business_id,
      event_type: params.event_type,
      metadata: params.metadata || {},
      created_at: new Date().toISOString(),
    });
  } catch { /* silent */ }
}
