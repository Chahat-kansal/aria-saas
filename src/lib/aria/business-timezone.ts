import { supabaseAdmin } from '@/lib/supabase-admin'

// TZ-3 — resolve a business's IANA timezone from businesses.timezone (column exists, populated with
// IANA strings). Falls back to Australia/Melbourne for null/invalid. Cached (10 min) so the hot
// groundTruth path doesn't re-query per turn. Pass the result into the date-au helpers' optional tz.

const MEL = 'Australia/Melbourne';
const TTL_MS = 10 * 60 * 1000;
const _cache = new Map<string, { tz: string; at: number }>();

function isValidIana(tz: string): boolean {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

export async function resolveBusinessTimezone(businessId: string): Promise<string> {
  const cached = _cache.get(businessId);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.tz;

  let tz = MEL;
  try {
    const { data } = await supabaseAdmin
      .from('businesses')
      .select('timezone')
      .eq('id', businessId)
      .maybeSingle();
    const raw = (data as { timezone?: string | null } | null)?.timezone;
    if (raw && isValidIana(raw)) tz = raw;
  } catch { /* default to Melbourne */ }

  _cache.set(businessId, { tz, at: Date.now() });
  return tz;
}
