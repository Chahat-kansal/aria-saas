export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { getCxSessionServer } from '@/lib/cx/get-cx-session'

const BG = '#f3efe4'
const INK = '#0a0a0a'
const ACCENT = '#d9f54e'
const ACCENT_TEXT = '#2f3a06'
const INK_MUTED = '#6b7280'
const FD = "var(--font-display,'Cormorant',Georgia,serif)"
const FB = "var(--font-body,'Outfit',system-ui,sans-serif)"

type RuleConfig = { name?: string; description?: string; image_url?: string }

// LOY-REDEEM — was a dead link (RewardsClient linked here for every "Redeem" tap, but this route never
// existed → 404 for any member with enough points). Redemption in this app is staff-mediated at the till
// (see OffersTab: "Redemption happens in store", and the counter-QR / redeem-scan POS flow) — no
// self-service points-spend endpoint exists, so this page confirms the reward and tells the member to
// show it to staff, rather than inventing a new customer-authenticated spend action.
export default async function LoyaltyRedeemPage({ params, searchParams }: {
  params: { slug: string }
  searchParams: { rule?: string }
}) {
  const slug = decodeURIComponent(params.slug ?? '').toLowerCase()
  const ruleId = searchParams.rule ?? ''
  if (!slug || !ruleId) notFound()

  const bid = await resolveBusinessId(supabaseAdmin, slug)
  if (!bid) notFound()

  const { data: biz } = await supabaseAdmin.from('businesses').select('id, name').eq('id', bid).maybeSingle()
  if (!biz) notFound()

  const session = await getCxSessionServer(bid)

  const { data: rule } = await supabaseAdmin
    .from('loyalty_reward_rules')
    .select('id, threshold_value, is_active, config')
    .eq('id', ruleId).eq('business_id', bid).eq('is_active', true)
    .maybeSingle()
  if (!rule) notFound()

  const cfg = (rule.config ?? {}) as RuleConfig
  const cost = Number(rule.threshold_value ?? 0)

  let pts = 0
  if (session) {
    const { data: customer } = await supabaseAdmin
      .from('pos_customers')
      .select('points_balance')
      .eq('business_id', bid).eq('loyalty_identity_id', session.identity_id)
      .is('deleted_at', null).maybeSingle()
    pts = Number((customer as { points_balance?: number | null } | null)?.points_balance) || 0
  }

  const eligible = !!session && cost > 0 && pts >= cost
  const backHref = '/' + slug + '/rewards'

  return (
    <div style={{ minHeight: '100dvh', background: BG }}>
      <style>{'*, *::before, *::after { box-sizing: border-box }'}</style>
      <div style={{ maxWidth: '28rem', margin: '0 auto', minHeight: '100dvh', background: BG, fontFamily: FB, color: INK, padding: '32px 16px' }}>
        <Link href={backHref} style={{ fontFamily: FB, fontSize: 13, color: INK_MUTED, textDecoration: 'none' }}>&larr; Back to rewards</Link>

        <div style={{
          marginTop: 24, padding: '32px 22px', textAlign: 'center',
          background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
          borderRadius: 18, border: '1px solid rgba(255,255,255,0.60)', boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
        }}>
          {!session ? (
            <>
              <p style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 24, margin: '0 0 8px' }}>Sign in first</p>
              <p style={{ fontFamily: FB, fontSize: 14, color: INK_MUTED, margin: 0 }}>Sign in to your {biz.name} loyalty account to redeem this reward.</p>
            </>
          ) : !eligible ? (
            <>
              <p style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 24, margin: '0 0 8px' }}>Not quite yet</p>
              <p style={{ fontFamily: FB, fontSize: 14, color: INK_MUTED, margin: 0 }}>
                {'You have ' + pts + ' pts — this reward needs ' + cost + ' pts.'}
              </p>
            </>
          ) : (
            <>
              <p style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 26, margin: '0 0 6px', color: INK }}>{cfg.name ?? 'Your reward'}</p>
              {cfg.description && <p style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 15, color: '#55554e', margin: '0 0 16px' }}>{cfg.description}</p>}
              <div style={{
                display: 'inline-block', background: ACCENT, color: ACCENT_TEXT, borderRadius: 100,
                padding: '8px 18px', fontFamily: FB, fontSize: 14, fontWeight: 700, marginBottom: 18,
                boxShadow: '0 0 18px rgba(217,245,78,0.50)',
              }}>
                {cost + ' pts ready to redeem'}
              </div>
              <p style={{ fontFamily: FB, fontSize: 14, color: INK, margin: 0, lineHeight: 1.5 }}>
                Show this screen to staff at the counter to redeem — they&apos;ll apply it to your order.
              </p>
              <p style={{ fontFamily: FB, fontSize: 12, color: INK_MUTED, margin: '10px 0 0' }}>
                Your balance: {pts} pts
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
