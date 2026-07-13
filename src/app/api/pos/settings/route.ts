export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { getBusinessAddress } from '@/lib/business-address'
import { getBid } from '@/lib/auth/get-bid'

// H-17 — POST used to spread the whole request body directly into the DB write (insert AND
// update), so a client could set any column verbatim. Explicit allowlist matching pos_settings'
// real columns (confirmed live via information_schema — id/business_id/created_at/updated_at are
// never client-settable). NOTE: manager_pin and require_staff_pin do NOT live on pos_settings in
// production — they're pos_users.manager_pin and a column that was never applied (see
// 20260430000002_pos_variants.sql vs live schema) — confirmed via direct information_schema query,
// not the migration file (RULE 10). No other pos_settings column is a secret/internal-only field.
const SETTINGS_FIELDS = [
  'default_payment_method', 'accept_cash', 'accept_card', 'accept_split', 'card_surcharge_percent',
  'rounding', 'gst_rate', 'tax_inclusive', 'apply_gst_to_all',
  'receipt_business_name', 'receipt_abn', 'receipt_header', 'receipt_footer', 'receipt_show_gst',
  'receipt_show_change', 'receipt_print_format', 'receipt_email_from', 'receipt_prefix',
  'receipt_show_cashier', 'receipt_show_loyalty', 'receipt_logo_url', 'receipt_template',
  'receipt_template_name', 'show_gst_breakdown', 'gst_inclusive', 'cash_rounding',
  'loyalty_enabled', 'loyalty_program_name', 'loyalty_points_per_dollar', 'loyalty_redemption_rate',
  'loyalty_welcome_bonus', 'loyalty_birthday_bonus', 'loyalty_points_per_dollar_value',
  'loyalty_min_redemption',
  'surcharge_enabled', 'surcharge_type', 'surcharge_value', 'surcharge_applies_to',
  'surcharge_minimum_amount', 'surcharge_show_on_receipt',
  'accepted_payment_methods', 'timezone', 'require_pin_for_refunds', 'manager_approval_discount_pct',
  'business_abn', 'business_address', 'business_phone', 'business_website',
  'abn', 'address', 'phone',
] as const
function pickSettingsFields(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of SETTINGS_FIELDS) if (f in body) out[f] = body[f]
  return out
}

async function _GET() {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ settings: null });

  const { data } = await supabase.from('pos_settings').select('*').eq('business_id', bid).maybeSingle();

  // ADDRESS-1 (Part B.4b) — pos_settings.business_address is a manual receipt
  // override; when the owner never filled it in, fall back to the resolved
  // business address rather than showing a blank receipt header (AU
  // tax-invoice legal requirement). The manual field still wins if set.
  const settings = data ? { ...data } : data;
  if (settings && !settings.business_address) {
    const addr = await getBusinessAddress(bid);
    if (addr?.formatted) settings.business_address = addr.formatted;
  }

  return NextResponse.json({ settings });
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const bid = await getBid(supabase, user.id);
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 400 });

  const body = await req.json();
  const fields = pickSettingsFields(body);
  const { data: existing } = await supabase.from('pos_settings').select('id').eq('business_id', bid).maybeSingle();

  let error;
  if (existing) {
    ({ error } = await supabase.from('pos_settings').update(fields).eq('business_id', bid));
  } else {
    ({ error } = await supabase.from('pos_settings').insert({ ...fields, business_id: bid }));
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export const GET = withErrorCapture('pos/settings', _GET)
export const POST = withErrorCapture('pos/settings', _POST)
