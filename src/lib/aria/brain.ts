/**
 * Aria Brain — central observation engine.
 * Call ariaObserve() fire-and-forget from any route after a significant event.
 * All DB writes are best-effort; never throw to the caller.
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!

function adminClient() {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
}

export type ObservationCategory =
  | 'sales'
  | 'inventory'
  | 'staffing'
  | 'compliance'
  | 'operations'
  | 'customer'

export interface Observation {
  businessId: string
  category: ObservationCategory
  event: string          // e.g. 'sale_completed', 'low_stock', 'register_closed'
  metadata?: Record<string, unknown>
}

/** Log an activity entry (non-Aria, just audit trail). */
export async function logActivity(
  businessId: string,
  actionType: string,
  description: string,
  metadata?: Record<string, unknown>,
) {
  try {
    const sb = adminClient()
    await sb.from('activity_log').insert({
      business_id: businessId,
      action_type: actionType,
      description,
      metadata: metadata ?? {},
    })
  } catch { /* best-effort */ }
}

/** Check whether Aria is tracking a given category for a business. */
export async function isTracking(businessId: string, category: ObservationCategory): Promise<boolean> {
  try {
    const sb = adminClient()
    const { data } = await sb
      .from('aria_tracking_preferences')
      .select('is_tracking')
      .eq('business_id', businessId)
      .eq('category', category)
      .maybeSingle()
    // If no preference row, default to tracking = true
    return data?.is_tracking ?? true
  } catch { return true }
}

/** The main observation entry point. Call fire-and-forget. */
export async function ariaObserve(obs: Observation): Promise<void> {
  try {
    const tracking = await isTracking(obs.businessId, obs.category)
    if (!tracking) return

    const insight = await generateInsight(obs)
    if (!insight) return

    const sb = adminClient()
    await sb.from('aria_autopilot_actions').insert({
      business_id: obs.businessId,
      category: obs.category,
      priority: insight.priority,
      title: insight.title,
      description: insight.description,
      action_data: { event: obs.event, ...obs.metadata },
      estimated_impact: insight.estimatedImpact,
      status: 'pending',
    })
  } catch { /* best-effort, never propagate */ }
}

interface InsightSpec {
  priority: 'high' | 'medium' | 'low'
  title: string
  description: string
  estimatedImpact: string
}

async function generateInsight(obs: Observation): Promise<InsightSpec | null> {
  const m = obs.metadata ?? {}

  switch (obs.event) {
    case 'low_stock': {
      const product = m.product_name as string | undefined
      const qty     = m.quantity as number | undefined
      if (!product || qty === undefined) return null
      return {
        priority: qty === 0 ? 'high' : 'medium',
        title: qty === 0 ? `${product} is out of stock` : `${product} is running low`,
        description: `${product} has ${qty} unit${qty === 1 ? '' : 's'} remaining. Consider reordering soon to avoid lost sales.`,
        estimatedImpact: qty === 0 ? 'Prevent lost sales immediately' : 'Prevent stockout within days',
      }
    }

    case 'sale_completed': {
      const total = m.total_cents as number | undefined
      if (!total || total < 50000) return null // only flag sales >$500
      return {
        priority: 'low',
        title: `Large sale: A$${(total / 100).toFixed(2)}`,
        description: `A high-value transaction was just completed. Check if a receipt or invoice is needed.`,
        estimatedImpact: 'Ensure customer satisfaction on big orders',
      }
    }

    case 'register_closed': {
      const variance = m.variance_cents as number | undefined
      if (variance === undefined || Math.abs(variance) < 500) return null // ignore <$5 variance
      const sign = variance < 0 ? 'short' : 'over'
      const amt  = Math.abs(variance) / 100
      return {
        priority: Math.abs(variance) > 5000 ? 'high' : 'medium',
        title: `Register ${sign} by A$${amt.toFixed(2)}`,
        description: `The register was ${sign} by A$${amt.toFixed(2)} at close. Review cash handling.`,
        estimatedImpact: 'Identify cash discrepancies early',
      }
    }

    case 'order_received': {
      return null // informational only, no insight needed
    }

    case 'expiry_alert_created': {
      const product = m.product_name as string | undefined
      const days    = m.days_until_expiry as number | undefined
      if (!product) return null
      return {
        priority: (days ?? 60) <= 7 ? 'high' : 'medium',
        title: `${product} expiring soon`,
        description: `A batch of ${product} expires in ${days ?? 'a few'} days. Consider discounting or using it first.`,
        estimatedImpact: 'Reduce food waste and markdown losses',
      }
    }

    case 'compliance_item_overdue': {
      const item = m.item_name as string | undefined
      return {
        priority: 'high',
        title: `Compliance item overdue${item ? `: ${item}` : ''}`,
        description: `A compliance checklist item is overdue${item ? ` (${item})` : ''}. Complete it to stay compliant.`,
        estimatedImpact: 'Avoid regulatory risk',
      }
    }

    default:
      return null
  }
}