# Prompt 236 — Reels as a Separate Feature: Enable Once, Dedicated Section, Auto-Billing

## Rules
1. Read FULL content of every file before touching it — no assumptions
2. `npx tsc --noEmit` — zero errors before committing
3. ONE commit: `feat(reels): Reels as standalone feature — one-time enable, dedicated section, Stripe metered billing`
4. UPGRADE_ONLY — nothing removed
5. str_replace only — no full file rewrites on large files

## Read these files in full before starting
- `src/app/dashboard/social/page.tsx` — full social page
- `src/app/api/stripe/webhook/route.ts` — existing Stripe webhook
- `src/app/api/billing/checkout/route.ts` — how Stripe customers are created
- `src/app/api/social/reels-addon/route.ts` — existing enable/disable route
- `supabase/migrations/20260505000004_social_media.sql` — social_preferences schema

## Context — what exists
- `business_subscriptions` table has `stripe_customer_id`, `stripe_subscription_id`
- Stripe webhook already handles `checkout.session.completed`, `invoice.payment_succeeded`
- `reel_usage_log` table tracks every Reel generated with `cost_aud`
- `social_preferences.reels_enabled` — true/false per business
- The existing "Enable Reels" modal exists but is buried on every post card

## PART A — DB migration
File: `supabase/migrations/20260604000005_reels_billing.sql`

```sql
-- Track Stripe metered billing for Reels per business
ALTER TABLE business_subscriptions
  ADD COLUMN IF NOT EXISTS reels_stripe_item_id TEXT,     -- Stripe subscription item ID for Reels meter
  ADD COLUMN IF NOT EXISTS reels_enabled_at TIMESTAMPTZ,  -- when they first enabled Reels
  ADD COLUMN IF NOT EXISTS reels_meter_id TEXT;            -- Stripe meter ID if using Meter API

-- Monthly Reel invoice summary — generated at billing cycle end
CREATE TABLE IF NOT EXISTS reel_monthly_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  billing_month TEXT NOT NULL,           -- '2026-06' format
  reel_count INTEGER NOT NULL DEFAULT 0,
  total_cost_aud NUMERIC(10,2) NOT NULL DEFAULT 0,
  stripe_invoice_item_id TEXT,           -- Stripe invoice item once billed
  status TEXT DEFAULT 'pending'          -- pending | billed | paid
    CHECK (status IN ('pending','billed','paid')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, billing_month)
);
ALTER TABLE reel_monthly_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_reel_invoices" ON reel_monthly_invoices
  FOR SELECT USING (
    business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid())
  );
```

## PART B — Stripe Metered Billing route
File: `src/app/api/billing/reels-usage/route.ts`

This route is called internally after every Reel generation to record usage in Stripe.
Business owners are never charged more than what is shown — this just logs the unit to Stripe
so it appears on their next invoice automatically.

```typescript
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import Stripe from 'stripe'

/**
 * POST /api/billing/reels-usage
 * Called internally after every successful Reel generation.
 * Records 1 unit of usage against the business Stripe subscription.
 * This causes the cost to appear on their next monthly invoice automatically.
 *
 * Stripe Metered Billing flow:
 * - Each business has a Stripe subscription item for "Reels" (reels_stripe_item_id)
 * - We call stripe.subscriptionItems.createUsageRecord() with quantity=1
 * - Stripe tallies all usage and bills at end of billing period
 * - invoice.payment_succeeded webhook fires — already handled
 *
 * If STRIPE_SECRET_KEY not set or no Stripe item: log to reel_monthly_invoices only.
 * We still generate the Reel — billing failure never blocks content generation.
 */
export async function POST(req: NextRequest) {
  const { business_id, post_id, cost_aud, duration_seconds, reel_mode, fal_request_id } =
    await req.json() as {
      business_id: string
      post_id?: string
      cost_aud: number
      duration_seconds: number
      reel_mode?: string
      fal_request_id?: string
    }

  if (!business_id || !cost_aud) {
    return NextResponse.json({ error: 'business_id and cost_aud required' }, { status: 400 })
  }

  // 1. Log to reel_usage_log (source of truth, always works)
  await supabaseAdmin.from('reel_usage_log').insert({
    business_id,
    post_id: post_id ?? null,
    cost_aud,
    duration_seconds,
    provider: 'fal-ai/kling',
    reel_mode: reel_mode ?? null,
    fal_request_id: fal_request_id ?? null,
  }).catch(() => {})

  // 2. Update reel_monthly_invoices (for dashboard display)
  const billingMonth = new Date().toISOString().slice(0, 7) // '2026-06'
  await supabaseAdmin.from('reel_monthly_invoices').upsert({
    business_id,
    billing_month: billingMonth,
    reel_count: 1,          // will be incremented by trigger or separate query
    total_cost_aud: cost_aud,
    status: 'pending',
  }, { onConflict: 'business_id,billing_month' }).then(async () => {
    // Increment counts properly
    await supabaseAdmin.rpc('increment_reel_invoice', {
      p_business_id: business_id,
      p_billing_month: billingMonth,
      p_cost: cost_aud,
    }).catch(() => {})
  })

  // 3. Stripe metered usage (if configured)
  if (process.env.STRIPE_SECRET_KEY) {
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' })

      const { data: sub } = await supabaseAdmin
        .from('business_subscriptions')
        .select('stripe_customer_id, stripe_subscription_id, reels_stripe_item_id')
        .eq('business_id', business_id)
        .maybeSingle()

      if (sub?.reels_stripe_item_id) {
        // Existing metered item — record usage
        await stripe.subscriptionItems.createUsageRecord(
          sub.reels_stripe_item_id,
          {
            quantity: 1,
            timestamp: Math.floor(Date.now() / 1000),
            action: 'increment',
          }
        )
      } else if (sub?.stripe_customer_id && sub?.stripe_subscription_id && process.env.STRIPE_REELS_PRICE_ID) {
        // Add Reels metered item to existing subscription if price ID configured
        const item = await stripe.subscriptionItems.create({
          subscription: sub.stripe_subscription_id,
          price: process.env.STRIPE_REELS_PRICE_ID,
          quantity: undefined, // metered = no fixed quantity
        })
        // Save the item ID for future usage records
        await supabaseAdmin.from('business_subscriptions')
          .update({ reels_stripe_item_id: item.id })
          .eq('business_id', business_id)
        // Record this usage
        await stripe.subscriptionItems.createUsageRecord(
          item.id,
          { quantity: 1, timestamp: Math.floor(Date.now() / 1000), action: 'increment' }
        )
      }
      // If no Stripe subscription yet: usage logged locally, will be billed manually
    } catch (e: any) {
      // Stripe errors never block Reel delivery — log and continue
      console.error('[reels-usage] Stripe error:', e.message)
    }
  }

  return NextResponse.json({ ok: true })
}
```

Add the increment function to the migration:
```sql
CREATE OR REPLACE FUNCTION increment_reel_invoice(
  p_business_id UUID, p_billing_month TEXT, p_cost NUMERIC
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO reel_monthly_invoices (business_id, billing_month, reel_count, total_cost_aud, status)
  VALUES (p_business_id, p_billing_month, 1, p_cost, 'pending')
  ON CONFLICT (business_id, billing_month)
  DO UPDATE SET
    reel_count = reel_monthly_invoices.reel_count + 1,
    total_cost_aud = reel_monthly_invoices.total_cost_aud + p_cost;
END;
$$;
```

## PART C — Call billing route after each Reel completes
In `src/app/api/social/generate-video/route.ts` GET handler, after saving video_url and
before returning `{ status: 'COMPLETED', video_url }`:

```typescript
// Fire-and-forget billing — never block video delivery on billing errors
if (business_id && !is_admin) {
  fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/billing/reels-usage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      business_id,
      post_id: post_id ?? null,
      cost_aud: calcCostAUD(duration_seconds ?? 15),
      duration_seconds: duration_seconds ?? 15,
      reel_mode,
      fal_request_id,
    }),
  }).catch(() => {}) // Never throw — billing failure never blocks content
}
```

## PART D — Social page redesign: Reels as a separate feature section
File: `src/app/dashboard/social/page.tsx`

Read the FULL file. Make targeted str_replace edits only.

### D1 — Remove "Enable Reels" button from every post card
The Enable Reels button currently appears on each post card. Remove it from the post card entirely.
It will only appear as a banner at the top of the page (see D2).

Find the section around line 1193-1199 that renders:
```
{!reelsEnabled ? (
  <button onClick={() => setShowReelsModal(true)} ...>
    🎬 Enable Reels (Add-on)
  </button>
```
Replace with just showing the "Create Reel" button always (the modal handles the gate):
```tsx
<button onClick={() => generateVideo(post.id, (post as any).reel_concept)}
  style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid rgba(59,130,246,0.4)',
    background: 'rgba(59,130,246,0.1)', color: '#3B82F6', fontSize: 11, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit' }}>
  🎬 Create Reel
</button>
```

The Reel Creator panel itself checks `reelsEnabled` and shows the enable flow if needed (see D3).

### D2 — One-time Reels enable banner at the very top of the page
Add this state:
```typescript
const [reelsBannerDismissed, setReelsBannerDismissed] = useState(false)
const [reelsBillingThisMonth, setReelsBillingThisMonth] = useState<{
  reel_count: number; total_cost_aud: number; billing_month: string
} | null>(null)
```

Load monthly billing in the existing useEffect:
```typescript
if (bid) {
  fetch(`/api/social/reel-billing?business_id=${bid}`)
    .then(r => r.ok ? r.json() : null)
    .then(d => { if (d) setReelsBillingThisMonth(d) })
    .catch(() => {})
}
```

Render at the VERY TOP of the page return, BEFORE everything else, only when not enabled:
```tsx
{!reelsEnabled && !reelsBannerDismissed && (
  <div style={{
    background: 'linear-gradient(135deg, rgba(59,130,246,0.08) 0%, rgba(127,184,151,0.08) 100%)',
    border: '1px solid rgba(127,184,151,0.25)',
    borderRadius: 14, padding: '16px 20px', marginBottom: 20,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
  }}>
    <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
      <div style={{ fontSize: 28, flexShrink: 0 }}>🎬</div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 3 }}>
          Unlock AI Reels — from A$0.56 per Reel
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          Turn your product photos into 15–30 second video Reels with an AI influencer. 
          Posted directly to Instagram, Facebook and TikTok. Pay only for what you generate.
        </div>
      </div>
    </div>
    <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
      <button onClick={() => setReelsBannerDismissed(true)}
        style={{ fontSize: 12, color: 'var(--text-tertiary)', background: 'none', border: 'none',
          cursor: 'pointer', fontFamily: 'inherit', padding: '4px 8px' }}>
        Dismiss
      </button>
      <button onClick={() => setShowReelsModal(true)}
        style={{ padding: '9px 18px', borderRadius: 10, fontFamily: 'inherit', fontWeight: 700,
          fontSize: 13, cursor: 'pointer', background: 'rgba(127,184,151,0.15)',
          border: '1px solid rgba(127,184,151,0.4)', color: '#7FB897', whiteSpace: 'nowrap' as const }}>
        Enable Reels →
      </button>
    </div>
  </div>
)}
```

When enabled, show a small status bar instead:
```tsx
{reelsEnabled && reelsBillingThisMonth && reelsBillingThisMonth.reel_count > 0 && (
  <div style={{
    background: 'rgba(127,184,151,0.06)', border: '1px solid rgba(127,184,151,0.15)',
    borderRadius: 10, padding: '10px 16px', marginBottom: 16,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  }}>
    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
      🎬 <strong style={{ color: 'var(--text-primary)' }}>{reelsBillingThisMonth.reel_count} Reels</strong> generated this month
    </span>
    <span style={{ fontSize: 12, fontWeight: 700, color: '#F59E0B' }}>
      A${reelsBillingThisMonth.total_cost_aud.toFixed(2)} · added to your {new Date().toLocaleString('en-AU', { month: 'long' })} invoice
    </span>
  </div>
)}
```

### D3 — Reel Creator panel: gate inside the panel, not outside
In the Reel Creator panel (`reelCreatorPostId !== null`), at the very top before the mode tabs,
add a gate if reels not enabled:

```tsx
{/* If Reels not enabled — show enable prompt inside the panel */}
{!reelsEnabled ? (
  <div style={{ textAlign: 'center' as const, padding: '32px 0' }}>
    <div style={{ fontSize: 40, marginBottom: 16 }}>🎬</div>
    <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 10 }}>
      Enable AI Reels first
    </div>
    <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 24, maxWidth: 320, margin: '0 auto 24px' }}>
      AI Reels cost from A$0.56 per video. You pay only when you generate — added to your monthly invoice.
      No subscription required.
    </p>
    <button onClick={enableReels} disabled={reelsLoading}
      style={{ padding: '12px 28px', borderRadius: 12, fontFamily: 'inherit', fontWeight: 700,
        fontSize: 14, cursor: reelsLoading ? 'wait' : 'pointer',
        background: 'rgba(127,184,151,0.15)', border: '1px solid rgba(127,184,151,0.4)', color: '#7FB897' }}>
      {reelsLoading ? 'Enabling...' : '✓ Enable Reels — I understand the cost'}
    </button>
    <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 12 }}>
      You will only be charged for Reels you generate. You can disable at any time.
    </p>
  </div>
) : (
  // ... existing full Reel Creator panel content (mode tabs, style picker, etc.)
)}
```

### D4 — Add Reels tab to the social page
The social page currently shows "Posts" content. Add a top-level tab switcher:

Add state: `const [socialTab, setSocialTab] = useState<'posts' | 'reels'>('posts')`

Add tab bar near the top of the page content (after the banners):
```tsx
<div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
  {(['posts', 'reels'] as const).map(t => (
    <button key={t} onClick={() => setSocialTab(t)} style={{
      padding: '8px 20px', borderRadius: 10, fontFamily: 'inherit', fontWeight: 700, fontSize: 13,
      cursor: 'pointer', border: '1px solid',
      background: socialTab === t ? 'rgba(127,184,151,0.12)' : 'transparent',
      borderColor: socialTab === t ? 'rgba(127,184,151,0.4)' : 'rgba(255,255,255,0.08)',
      color: socialTab === t ? '#7FB897' : 'var(--text-secondary)',
      textTransform: 'capitalize' as const,
    }}>
      {t === 'posts' ? '📸 Posts' : '🎬 Reels'}
      {t === 'reels' && reelsBillingThisMonth?.reel_count
        ? ` (${reelsBillingThisMonth.reel_count})`
        : ''}
    </button>
  ))}
</div>
```

Wrap the existing posts content with `{socialTab === 'posts' && (...)}`.

Add the Reels tab content with `{socialTab === 'reels' && (<ReelsSection />)}`.

### D5 — Reels section content
When `socialTab === 'reels'`, show:

```tsx
{socialTab === 'reels' && (
  <div>
    {/* Monthly billing summary */}
    <div style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 14, padding: '20px 24px', marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)',
        textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
        {new Date().toLocaleString('en-AU', { month: 'long', year: 'numeric' })} usage
      </div>
      <div style={{ display: 'flex', gap: 24 }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)' }}>
            {reelsBillingThisMonth?.reel_count ?? 0}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Reels generated</div>
        </div>
        <div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#F59E0B' }}>
            A${(reelsBillingThisMonth?.total_cost_aud ?? 0).toFixed(2)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            added to {new Date().toLocaleString('en-AU', { month: 'long' })} invoice
          </div>
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#3B82F6' }}>A$0.56</div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>per 10s Reel</div>
        </div>
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 12, lineHeight: 1.6 }}>
        Reel costs are metered and added to your monthly Aria invoice automatically.
        You are charged per Reel generated, not a flat fee.
      </p>
    </div>

    {/* Create new Reel button */}
    {reelsEnabled && (
      <button onClick={() => {
        // Open Reel Creator without a specific post — creates a standalone Reel
        setReelCreatorPostId('standalone')
        setReelMode('text')
        setReelCustomPrompt('')
        setReelSourceImage(null)
        setReelDuration(15)
      }} style={{
        width: '100%', padding: '16px', borderRadius: 14, fontFamily: 'inherit', fontWeight: 700,
        fontSize: 15, cursor: 'pointer', marginBottom: 20,
        background: 'rgba(127,184,151,0.1)', border: '1px dashed rgba(127,184,151,0.4)',
        color: '#7FB897', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
      }}>
        <span>✦</span> Create New Reel
      </button>
    )}

    {/* Influencer library */}
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 12 }}>
        🌟 AI Influencer Library — included with Reels
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, overflowX: 'auto' as const }}>
        {influencerLibrary.slice(0, 8).map(inf => (
          <div key={inf.id} style={{
            borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)',
            cursor: 'pointer',
          }} onClick={() => {
            setSelectedInfluencerId(inf.id)
            setSelectedInfluencerUrl(inf.image_url)
            setReelCreatorPostId('standalone')
            setReelMode('auto')
          }}>
            <img src={inf.image_url} alt={inf.name}
              style={{ width: '100%', aspectRatio: '3/4', objectFit: 'cover', display: 'block' }} />
            <div style={{ padding: '6px 8px', background: 'rgba(0,0,0,0.3)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>{inf.name}</div>
              {inf.is_featured && (
                <div style={{ fontSize: 9, color: '#7FB897', fontWeight: 700 }}>★ FEATURED</div>
              )}
            </div>
          </div>
        ))}
      </div>
      {influencerLibrary.length > 8 && (
        <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>
          +{influencerLibrary.length - 8} more available in the Reel Creator
        </p>
      )}
    </div>

    {/* Published Reels history */}
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 12 }}>
        Recent Reels
      </div>
      {posts.filter(p => (p as any).post_type === 'reel' || (p as any).video_url).length === 0 ? (
        <div style={{ textAlign: 'center' as const, padding: '40px 24px',
          color: 'var(--text-tertiary)', fontSize: 13 }}>
          No Reels yet. Create your first Reel above or use an AI influencer from the library.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          {posts.filter(p => (p as any).video_url).map(post => (
            <div key={post.id} style={{ background: 'var(--bg-surface)',
              border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, overflow: 'hidden' }}>
              <video src={(post as any).video_url} controls muted
                style={{ width: '100%', aspectRatio: '9/16', objectFit: 'cover', maxHeight: 280 }} />
              <div style={{ padding: '10px 12px' }}>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, marginBottom: 4 }}>
                  {post.caption}
                </p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                    {new Date(post.created_at).toLocaleDateString('en-AU')}
                  </span>
                  {(post as any).reel_cost_aud && (
                    <span style={{ fontSize: 10, color: '#F59E0B', fontWeight: 700 }}>
                      A${Number((post as any).reel_cost_aud).toFixed(2)}
                    </span>
                  )}
                  <span style={{
                    fontSize: 10, padding: '2px 6px', borderRadius: 99, fontWeight: 700,
                    background: post.status === 'published' ? 'rgba(34,197,94,0.12)' : 'rgba(251,191,36,0.12)',
                    color: post.status === 'published' ? '#22C55E' : '#F59E0B',
                  }}>
                    {post.status}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  </div>
)}
```

### D6 — Handle 'standalone' Reel (no post attached)
In `submitReelGeneration`, handle the case where `reelCreatorPostId === 'standalone'`:
- Create a new social_post with `post_type: 'reel'`, `status: 'draft'`, platform: 'instagram'
- Then use that post_id for generation
- After generation: reload posts

```typescript
async function submitReelGeneration() {
  if (!reelCreatorPostId || !bid) return
  setReelGenerating(true)

  let postId = reelCreatorPostId === 'standalone' ? null : reelCreatorPostId

  // Create a post if standalone
  if (reelCreatorPostId === 'standalone') {
    const { data: newPost } = await supabase  // use the supabase client
      .from('social_posts')
      .insert({
        business_id: bid,
        platform: 'instagram',
        caption: reelCustomPrompt || 'AI-generated Reel',
        hashtags: [],
        post_type: 'reel',
        status: 'draft',
      })
      .select()
      .single()
    postId = newPost?.id ?? null
  }

  // ... rest of existing submitReelGeneration logic using postId
}
```

Note: The social page likely uses supabase client from context — check how other mutations are done
and use the same pattern.

## PART E — Remove existing Reels modal
The existing `showReelsModal` state and the `{showReelsModal && (...)}` overlay block can stay
as-is for now (they are triggered from the enable banner and from inside the Reel Creator panel).
Just make sure the modal's "Enable" button calls `enableReels()` which POSTs to `/api/social/reels-addon`.

## PART F — Add TikTok env vars note
In `src/app/api/social/callback/tiktok/route.ts` (which prompt 234 creates), ensure
TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET are read from env. The values are:
- TIKTOK_CLIENT_KEY = awc7dmpdxeat7lnl
- TIKTOK_CLIENT_SECRET = (in Vercel env — already added by user)
Do NOT hardcode these — they should already be in Vercel env.

## PART G — Webhook: handle invoice.paid for Reels
In `src/app/api/stripe/webhook/route.ts`, add after the existing `invoice.payment_succeeded` handler:

```typescript
// Mark reel_monthly_invoices as paid when Stripe invoice succeeds
if (event.type === 'invoice.payment_succeeded') {
  const invoice = event.data.object as Stripe.Invoice
  const customerId = typeof invoice.customer === 'string' ? invoice.customer : (invoice.customer as any)?.id
  if (customerId) {
    // Find business
    const { data: bSub } = await supabaseAdmin
      .from('business_subscriptions')
      .select('business_id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle()
    if (bSub?.business_id) {
      const billingMonth = new Date().toISOString().slice(0, 7)
      await supabaseAdmin.from('reel_monthly_invoices')
        .update({ status: 'paid' })
        .eq('business_id', bSub.business_id)
        .eq('billing_month', billingMonth)
        .eq('status', 'billed')
        .catch(() => {})
    }
  }
}
```

## Final checklist
- [ ] `npx tsc --noEmit` — zero errors
- [ ] Enable Reels banner appears at top of social page when not enabled, disappears once enabled
- [ ] Enable Reels modal only triggers from the banner or inside the Reel Creator — NOT from post cards
- [ ] Post cards show "Create Reel" button directly (Reel Creator panel handles the gate)
- [ ] Reels tab shows: billing summary, influencer library preview, create button, history of Reels
- [ ] Reel Creator shows enable prompt when reels_enabled=false, full creator when true
- [ ] Every successful Reel calls `/api/billing/reels-usage` fire-and-forget
- [ ] `/api/billing/reels-usage` logs to reel_usage_log AND reel_monthly_invoices AND Stripe (if configured)
- [ ] `increment_reel_invoice` function in migration handles upsert+increment correctly
- [ ] Standalone Reel creation (from Reels tab) creates a social_post first
- [ ] Stripe webhook marks reel_monthly_invoices as paid on invoice.payment_succeeded
- [ ] `reels_stripe_item_id` saved to business_subscriptions when Stripe item created
- [ ] STRIPE_REELS_PRICE_ID env var noted but not hardcoded
- [ ] Billing fails gracefully — Reel always delivered even if Stripe call errors
