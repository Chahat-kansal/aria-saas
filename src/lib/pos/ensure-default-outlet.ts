import type { SupabaseClient } from '@supabase/supabase-js'

// LAUNCH-PREP-1 — the canonical "an onboarded business must have at least one outlet" guarantee.
// Extracted from the logic api/onboarding/provision/route.ts already had (previously gated behind
// `businessModel !== 'service'` and only reachable from that one route). The smoke-suite run that
// found onboarding_complete=true representable with ZERO pos_outlets rows proved this needs to be
// unconditional and called from every place onboarding can complete, not just one: the POS
// terminal's register-open flow needs a real outlet regardless of declared business_model, and
// api/settings/locations/route.ts (add another location) and onboarding/connect/page.tsx (the
// actual "Launch" button most flows end on) had NO outlet-creation logic at all. Idempotent —
// checks for an existing outlet before creating one, safe to call on every completion path.
export async function ensureDefaultOutlet(
  supabaseAdmin: SupabaseClient,
  businessId: string,
  fallbackName?: string | null,
): Promise<void> {
  try {
    const { count: outletCount } = await supabaseAdmin
      .from('pos_outlets').select('id', { count: 'exact', head: true }).eq('business_id', businessId)
    if (outletCount) return

    const { data: biz } = await supabaseAdmin
      .from('businesses')
      .select('name, address, phone')
      .eq('id', businessId)
      .maybeSingle()

    const { data: outlet } = await supabaseAdmin
      .from('pos_outlets')
      .insert({
        business_id: businessId,
        name: (biz?.name as string) || fallbackName || 'Main location',
        address: (biz?.address as string) ?? null,
        phone: (biz?.phone as string) ?? null,
        is_default: true, is_active: true,
      })
      .select('id').single()

    if (outlet) {
      await supabaseAdmin.from('pos_registers').insert({
        business_id: businessId, outlet_id: outlet.id, name: 'Main Register', is_active: true,
      })
    }
  } catch (e) {
    // Non-fatal by design (matches the original provision/route.ts rationale) — a failure here
    // must never block onboarding completion; it just means the business stays outlet-less until
    // the next call (e.g. a later /pos/terminal visit re-triggering this, or manual setup).
    console.error('[ensureDefaultOutlet] non-fatal failure for', businessId, e)
  }
}
