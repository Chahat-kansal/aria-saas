/**
 * Aria External API Integrations
 * All third-party data sources with graceful fallbacks.
 * Works without any API keys — keys only unlock additional data.
 */
import { signUnsubToken } from '@/lib/unsubscribe-token'

// ─── 2A: Open Food Facts (barcode lookup) ────────────────────────────────────
export async function lookupBarcode(barcode: string): Promise<{
  found: boolean;
  name?: string; brand?: string; category?: string; image_url?: string;
  is_age_restricted?: boolean; size?: string; ingredients?: string;
}> {
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`,
      { headers: { 'User-Agent': 'Aria-Business-Platform/1.0 (aria.com.au)' }, signal: AbortSignal.timeout(5000) }
    );
    const data = await res.json();
    if (data.status !== 1) return { found: false };
    const p = data.product;
    return {
      found: true,
      name: (p.product_name || p.product_name_en) as string | undefined,
      brand: p.brands as string | undefined,
      category: (p.categories as string | undefined)?.split(',')[0]?.trim(),
      image_url: p.image_url as string | undefined,
      is_age_restricted: /alcohol|beer|wine|spirit|tobacco/i.test((p.categories as string) ?? ''),
      size: p.quantity as string | undefined,
      ingredients: ((p.ingredients_text as string | undefined) ?? '').slice(0, 500) || undefined,
    };
  } catch { return { found: false }; }
}

// ─── 2B: Open Meteo (weather) ─────────────────────────────────────────────────
const CITY_COORDS: Record<string, [number, number]> = {
  'Melbourne': [-37.8136, 144.9631],
  'Sydney':    [-33.8688, 151.2093],
  'Brisbane':  [-27.4698, 153.0251],
  'Perth':     [-31.9505, 115.8605],
  'Adelaide':  [-34.9285, 138.6007],
  'Gold Coast':[-28.0167, 153.4000],
  'Canberra':  [-35.2809, 149.1300],
  'Darwin':    [-12.4634, 130.8456],
  'Hobart':    [-42.8821, 147.3272],
};

export interface DayForecast {
  date: string;
  temp_max: number; temp_min: number;
  is_hot: boolean; is_cold: boolean; is_raining: boolean;
  weather: 'hot' | 'warm' | 'mild' | 'cold' | 'wet';
  stock_uplift_categories: string[];
}

export async function getWeatherForecast(city: string): Promise<DayForecast[]> {
  try {
    const coords = CITY_COORDS[city] ?? CITY_COORDS['Melbourne'];
    const [lat, lng] = coords;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode&forecast_days=7&timezone=auto`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.daily.time as string[]).map((date: string, i: number) => {
      const max = data.daily.temperature_2m_max[i] as number;
      const min = data.daily.temperature_2m_min[i] as number;
      const rain = (data.daily.precipitation_sum[i] as number) > 2;
      const isHot = max > 30, isCold = max < 15;
      return {
        date, temp_max: max, temp_min: min,
        is_hot: isHot, is_cold: isCold, is_raining: rain,
        weather: isHot ? 'hot' : isCold ? 'cold' : rain ? 'wet' : 'mild',
        stock_uplift_categories: isHot
          ? ['Beer & Cider', 'Soft Drinks', 'Water', 'RTD', 'Wine (Rosé & White)']
          : isCold ? ['Wine (Red)', 'Spirits', 'Hot Beverages'] : [],
      } as DayForecast;
    });
  } catch { return []; }
}

export function getWeatherUplift(forecast: DayForecast[], category: string): number {
  const next3 = forecast.slice(0, 3);
  const hotDays  = next3.filter(d => d.is_hot).length;
  const coldDays = next3.filter(d => d.is_cold).length;
  const beer = ['Beer & Cider', 'Soft Drinks', 'Water', 'RTD'];
  const wine = ['Wine (Red)', 'Spirits'];
  if (hotDays >= 2 && beer.includes(category)) return 1.4;
  if (hotDays >= 1 && beer.includes(category)) return 1.2;
  if (coldDays >= 2 && wine.includes(category)) return 1.3;
  return 1.0;
}

// ─── 2C: ABS Retail Benchmarks ────────────────────────────────────────────────
export interface ABSRetailData {
  monthly_retail_turnover_growth_pct: number | null;
  cpi_annual_pct: number | null;
  wage_price_index_pct: number | null;
  retail_industry_average_pct: number | null;
  data_period: string;
  source: 'abs';
}

export async function getABSRetailBenchmarks(): Promise<ABSRetailData> {
  try {
    const res = await fetch(
      'https://api.data.abs.gov.au/data/RT/1.1.1+2.1+3.1+4.1+5.1+6.1+7.1+8.1+9.1/M?startPeriod=2025-01&detail=dataonly',
      { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return getABSFallback();
    const data = await res.json();
    const observations = data?.data?.dataSets?.[0]?.observations as Record<string, number[]> | undefined;
    if (!observations) return getABSFallback();
    const keys = Object.keys(observations).sort().reverse();
    const latestValue = observations[keys[0]]?.[0] ?? null;
    return {
      monthly_retail_turnover_growth_pct: latestValue,
      cpi_annual_pct: 3.8,
      wage_price_index_pct: 3.2,
      retail_industry_average_pct: latestValue ?? 2.1,
      data_period: new Date().toISOString().slice(0, 7),
      source: 'abs',
    };
  } catch { return getABSFallback(); }
}

function getABSFallback(): ABSRetailData {
  return {
    monthly_retail_turnover_growth_pct: 0.3,
    cpi_annual_pct: 3.8,
    wage_price_index_pct: 3.2,
    retail_industry_average_pct: 2.1,
    data_period: '2026-01',
    source: 'abs',
  };
}

// ─── 2D: RBA Data ─────────────────────────────────────────────────────────────
export interface RBAData {
  cash_rate_pct: number;
  inflation_target_low: number;
  inflation_target_high: number;
  next_rba_meeting: string | null;
  economic_outlook: string;
}

export async function getRBAData(): Promise<RBAData> {
  try {
    const res = await fetch('https://api.rba.gov.au/statistics/graph-data/cash-rate', { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return getRBAFallback();
    const data = await res.json() as Array<{ value?: number }>;
    const latest = data?.[data.length - 1];
    return {
      cash_rate_pct: latest?.value ?? 4.10,
      inflation_target_low: 2.0,
      inflation_target_high: 3.0,
      next_rba_meeting: '2026-06-17',
      economic_outlook: 'Stable with gradual easing expected H2 2026',
    };
  } catch { return getRBAFallback(); }
}

function getRBAFallback(): RBAData {
  return {
    cash_rate_pct: 4.10,
    inflation_target_low: 2.0,
    inflation_target_high: 3.0,
    next_rba_meeting: '2026-06-17',
    economic_outlook: 'Stable with gradual easing expected H2 2026',
  };
}

// ─── 2E: Australian Public Holidays 2026 ─────────────────────────────────────
export const AU_HOLIDAYS_2026: {
  name: string; date: string; states: string[];
  impact: number; category: string;
}[] = [
  { name: "New Year's Day",    date: '2026-01-01', states: ['ALL'], impact: 1.8, category: 'national' },
  { name: 'Australia Day',     date: '2026-01-26', states: ['ALL'], impact: 1.6, category: 'national' },
  { name: 'Good Friday',       date: '2026-04-03', states: ['ALL'], impact: 1.5, category: 'national' },
  { name: 'Easter Saturday',   date: '2026-04-04', states: ['ALL'], impact: 1.7, category: 'national' },
  { name: 'Easter Sunday',     date: '2026-04-05', states: ['ALL'], impact: 1.4, category: 'national' },
  { name: 'Easter Monday',     date: '2026-04-06', states: ['ALL'], impact: 1.5, category: 'national' },
  { name: 'ANZAC Day',         date: '2026-04-25', states: ['ALL'], impact: 1.4, category: 'national' },
  { name: "Queen's Birthday",  date: '2026-06-08', states: ['VIC','TAS','SA'], impact: 1.3, category: 'state' },
  { name: "Queen's Birthday",  date: '2026-06-22', states: ['WA'], impact: 1.3, category: 'state' },
  { name: 'EOFY',              date: '2026-06-30', states: ['ALL'], impact: 1.5, category: 'business' },
  { name: 'AFL Grand Final Eve', date: '2026-09-25', states: ['VIC'], impact: 2.5, category: 'event' },
  { name: 'AFL Grand Final',   date: '2026-09-26', states: ['VIC'], impact: 2.2, category: 'event' },
  { name: 'Melbourne Cup Day', date: '2026-11-03', states: ['VIC'], impact: 1.8, category: 'event' },
  { name: 'Christmas Eve',     date: '2026-12-24', states: ['ALL'], impact: 2.0, category: 'national' },
  { name: 'Christmas Day',     date: '2026-12-25', states: ['ALL'], impact: 2.0, category: 'national' },
  { name: 'Boxing Day',        date: '2026-12-26', states: ['ALL'], impact: 1.8, category: 'national' },
  { name: "New Year's Eve",    date: '2026-12-31', states: ['ALL'], impact: 1.7, category: 'national' },
];

export function getUpcomingHolidays(days = 60, state = 'VIC') {
  const now = Date.now();
  return AU_HOLIDAYS_2026
    .filter(h => h.states.includes('ALL') || h.states.includes(state))
    .map(h => ({ ...h, days_away: Math.ceil((new Date(h.date).getTime() - now) / 86400000) }))
    .filter(h => h.days_away > 0 && h.days_away <= days)
    .sort((a, b) => a.days_away - b.days_away);
}

export function getHolidayUplift(withinDays: number, category?: string, state = 'VIC'): number {
  const holidays = getUpcomingHolidays(withinDays, state);
  if (holidays.length === 0) return 1.0;
  const afl = holidays.find(h => h.name.includes('AFL'));
  if (afl && category === 'Beer & Cider') return 2.5;
  if (afl && category === 'Spirits')      return 1.4;
  const cup = holidays.find(h => h.name.includes('Cup'));
  if (cup && category?.includes('Wine'))  return 2.0;
  const xmas = holidays.find(h => h.name.includes('Christmas'));
  if (xmas && category === 'Spirits')     return 2.2;
  if (xmas && category === 'Wine')        return 1.8;
  return Math.max(...holidays.map(h => h.impact));
}

// ─── 2F: Google Places API ────────────────────────────────────────────────────
export interface PlaceResult {
  name: string; rating: number; review_count: number;
  address: string; place_id: string; price_level?: number;
}

export async function searchNearbyCompetitors(
  businessName: string, industry: string, city: string
): Promise<PlaceResult[]> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return [];
  try {
    const query = encodeURIComponent(`${industry === 'retail' ? 'bottle shop' : industry} ${city} Australia`);
    const res = await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&key=${key}`, { signal: AbortSignal.timeout(8000) });
    const data = await res.json() as { results?: any[] };
    return (data.results ?? [])
      .filter((p: any) => !(p.name as string).toLowerCase().includes(businessName.toLowerCase().split(' ')[0]))
      .slice(0, 5)
      .map((p: any) => ({ name: p.name, rating: p.rating ?? 0, review_count: p.user_ratings_total ?? 0, address: p.formatted_address, place_id: p.place_id, price_level: p.price_level }));
  } catch { return []; }
}

// ─── 2G: Resend Email ─────────────────────────────────────────────────────────
// MSG-COMPLIANCE-EMAIL — the single email chokepoint. Spam Act guardrails mirror sendSMS:
//  - MARKETING emails: carry a List-Unsubscribe header + visible unsubscribe footer, honour the
//    email_suppression opt-out list, and require pos_customers.email_consent when the customer is
//    resolvable. TRANSACTIONAL (default): exempt (receipts/invoices/OTP/owner reports always send).
//  - EVERY attempt (sent/skipped/failed) is written to email_send_log (audit record).
// supabaseAdmin is dynamically imported (matches this file's lazy-import pattern) so importing other
// external-apis helpers never pulls the service-role client into a client bundle.
export type EmailCategory = 'marketing' | 'transactional'
export interface SendEmailOptions {
  category?: EmailCategory
  businessId?: string | null
  customerId?: string | null
}

async function logEmailSend(row: {
  business_id: string | null
  to_email: string
  subject: string
  category: EmailCategory
  consent_ok: boolean | null
  suppressed: boolean
  resend_id: string | null
  status: 'sent' | 'failed' | 'skipped'
  error: string | null
}): Promise<void> {
  try {
    const { supabaseAdmin } = await import('@/lib/supabase-admin')
    await supabaseAdmin.from('email_send_log').insert(row)
  } catch (err) {
    console.error('[email] email_send_log insert failed:', err instanceof Error ? err.message : String(err))
  }
}

/** Add an address to the email opt-out list (for unsubscribe handling + manual/admin). */
export async function suppressEmail(
  businessId: string | null,
  email: string,
  reason: 'unsubscribe' | 'manual' | 'bounce' | 'complaint' = 'manual',
): Promise<void> {
  try {
    const { supabaseAdmin } = await import('@/lib/supabase-admin')
    await supabaseAdmin.from('email_suppression')
      .upsert({ business_id: businessId, email: email.toLowerCase().trim(), reason }, { onConflict: 'business_id,email' })
  } catch (err) {
    console.error('[email] suppressEmail failed:', err instanceof Error ? err.message : String(err))
  }
}

export async function sendEmail(
  params: { to: string; subject: string; html: string; from_name?: string },
  opts: SendEmailOptions = {},
): Promise<boolean> {
  const category: EmailCategory = opts.category ?? 'transactional'
  const businessId = opts.businessId ?? null
  const toNorm = (params.to ?? '').toLowerCase().trim()
  const domain = process.env.RESEND_FROM_DOMAIN ?? 'aria.com.au'

  let html = params.html
  let suppressed = false
  let consentOk: boolean | null = null
  const headers: Record<string, string> = {}

  if (category === 'marketing') {
    const { supabaseAdmin } = await import('@/lib/supabase-admin')

    // Unsubscribe mechanism (Spam Act requires a functional unsubscribe facility on marketing).
    // MSG-COMPLIANCE-2: a signed One-Click URL hitting the email-unsubscribe webhook → email_suppression.
    // Prefer the opaque customerId in the token (no raw PII in the URL); fall back to email otherwise.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_URL ?? 'https://www.ariaos.site'
    const token = signUnsubToken({ b: businessId, c: opts.customerId ?? null, e: opts.customerId ? null : toNorm })
    const unsub = `${appUrl}/api/webhooks/email-unsubscribe?token=${encodeURIComponent(token)}`
    headers['List-Unsubscribe'] = `<${unsub}>`
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click'
    if (!/unsubscribe/i.test(html)) {
      html = html + `<p style="color:#9ca3af;font-size:11px;text-align:center;margin-top:16px;">You received this because you opted in to offers. <a href="${unsub}">Unsubscribe</a>.</p>`
    }

    // Opt-out list
    try {
      let q = supabaseAdmin.from('email_suppression').select('id').eq('email', toNorm)
      q = businessId ? q.eq('business_id', businessId) : q.is('business_id', null)
      const { data: sup } = await q.limit(1).maybeSingle()
      if (sup) suppressed = true
    } catch (err) {
      console.error('[email] suppression check failed (fail-open):', err instanceof Error ? err.message : String(err))
    }

    // Per-channel email_consent (resolvable by customerId, else best-effort by address)
    if (!suppressed) {
      try {
        if (opts.customerId && businessId) {
          const { data: c } = await supabaseAdmin.from('pos_customers').select('email_consent')
            .eq('id', opts.customerId).eq('business_id', businessId).maybeSingle()
          if (c) consentOk = !!c.email_consent
        } else if (businessId) {
          const { data: c } = await supabaseAdmin.from('pos_customers').select('email_consent')
            .eq('business_id', businessId).eq('email', params.to).maybeSingle()
          if (c) consentOk = !!c.email_consent
        }
      } catch (err) {
        console.error('[email] consent check failed:', err instanceof Error ? err.message : String(err))
      }
    }
  }

  if (suppressed || consentOk === false) {
    await logEmailSend({
      business_id: businessId, to_email: toNorm, subject: params.subject, category,
      consent_ok: consentOk, suppressed, resend_id: null, status: 'skipped',
      error: suppressed ? 'suppressed' : 'no_consent',
    })
    return false
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log('[email] Resend not configured');
    await logEmailSend({ business_id: businessId, to_email: toNorm, subject: params.subject, category, consent_ok: consentOk, suppressed, resend_id: null, status: 'failed', error: 'Email not configured' })
    return false;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${params.from_name ?? 'Aria'} <aria@${domain}>`,
        to: params.to, subject: params.subject, html,
        ...(Object.keys(headers).length ? { headers } : {}),
      }),
    });
    let resendId: string | null = null
    try { const d = await res.json() as { id?: string }; resendId = d?.id ?? null } catch { /* body not json */ }
    await logEmailSend({ business_id: businessId, to_email: toNorm, subject: params.subject, category, consent_ok: consentOk, suppressed, resend_id: resendId, status: res.ok ? 'sent' : 'failed', error: res.ok ? null : `resend_http_${res.status}` })
    return res.ok;
  } catch (e) {
    await logEmailSend({ business_id: businessId, to_email: toNorm, subject: params.subject, category, consent_ok: consentOk, suppressed, resend_id: null, status: 'failed', error: e instanceof Error ? e.message : 'send_failed' })
    return false;
  }
}

// ─── 2H: SMS ─────────────────────────────────────────────────────────────────
export async function sendSMS(to: string, body: string): Promise<boolean> {
  const { sendSMS: _send } = await import('@/lib/clicksend')
  const result = await _send(to, body)
  return result.ok
}
