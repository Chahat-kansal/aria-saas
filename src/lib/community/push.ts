/**
 * Web Push helpers — wraps web-push for server-side sending.
 *
 * Configure via env:
 *   VAPID_PUBLIC_KEY    — base64url public key (also sent to the browser)
 *   VAPID_PRIVATE_KEY   — base64url private key
 *   VAPID_SUBJECT       — mailto: or https: URL identifying the sender
 *
 * If VAPID is not configured, send() is a no-op so the app still runs in dev.
 */
import webpush from 'web-push'
import { supabaseAdmin } from '@/lib/supabase-admin'

let configured = false
function configure() {
  if (configured) return true
  const pub = process.env.VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const sub = process.env.VAPID_SUBJECT ?? 'mailto:hello@ariaos.site'
  if (!pub || !priv) return false
  try {
    webpush.setVapidDetails(sub, pub, priv)
    configured = true
    return true
  } catch (err) {
    console.error('[push] VAPID config failed', err)
    return false
  }
}

export interface PushPayload {
  title: string
  body: string
  /** URL the customer lands on when they tap the notification */
  url?: string
  /** Optional image (e.g. business logo) — large notification image */
  image?: string
  /** Optional small icon (defaults to /icon-192.png if present) */
  icon?: string
  /** Tag — newer push with the same tag REPLACES the older one (Android) */
  tag?: string
}

/**
 * Send a push to every active subscription for a single member.
 * Removes stale subscriptions (404/410 from the push service) automatically.
 */
export async function pushToMember(member_id: string, payload: PushPayload) {
  if (!configure()) return { sent: 0, removed: 0, skipped: true as const }
  const { data: subs } = await supabaseAdmin.from('community_push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('member_id', member_id)
  const list = (subs ?? []) as Array<{ id: string; endpoint: string; p256dh: string; auth: string }>
  if (list.length === 0) return { sent: 0, removed: 0, skipped: false as const }

  let sent = 0
  let removed = 0
  const json = JSON.stringify(payload)
  await Promise.all(list.map(async s => {
    try {
      await webpush.sendNotification({
        endpoint: s.endpoint,
        keys: { p256dh: s.p256dh, auth: s.auth },
      }, json)
      sent++
    } catch (err: unknown) {
      const code = (err as { statusCode?: number })?.statusCode
      // 404 = endpoint gone, 410 = subscription expired. Clean those up.
      if (code === 404 || code === 410) {
        await supabaseAdmin.from('community_push_subscriptions').delete().eq('id', s.id)
        removed++
      } else {
        console.warn('[push] send failed', code, (err as Error)?.message)
      }
    }
  }))
  return { sent, removed, skipped: false as const }
}

/**
 * Fan-out: notify every follower of a business who has notifications_on=true
 * AND is_hidden=false (the "hide" toggle must silence pushes too).
 */
export async function notifyBusinessFollowers(business_id: string, payload: PushPayload) {
  if (!configure()) return { sent: 0, removed: 0, skipped: true as const }
  const { data: follows } = await supabaseAdmin.from('community_follows')
    .select('member_id')
    .eq('business_id', business_id)
    .eq('notifications_on', true)
    .eq('is_hidden', false)
    .is('unfollowed_at', null)
  const memberIds = ((follows ?? []) as Array<{ member_id: string }>).map(f => f.member_id)
  if (memberIds.length === 0) return { sent: 0, removed: 0, skipped: false as const }

  let sent = 0, removed = 0
  // Limit to a reasonable concurrency window
  const BATCH = 30
  for (let i = 0; i < memberIds.length; i += BATCH) {
    const slice = memberIds.slice(i, i + BATCH)
    const results = await Promise.all(slice.map(id => pushToMember(id, payload)))
    for (const r of results) { sent += r.sent; removed += r.removed }
  }
  return { sent, removed, skipped: false as const }
}

export function getPublicVapidKey(): string | null {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? process.env.VAPID_PUBLIC_KEY ?? null
}
