/**
 * Cross-posting adapter — one source draft, multiple destinations.
 *
 * Aria Community is the only fully-owned channel — always works.
 * Instagram / Facebook / Google Business require an existing connection in
 * social_connections; if not connected, that channel is skipped + flagged so
 * the owner sees which channels actually fired.
 *
 * Each channel keeps its own formatting:
 *   - Community: rich post with title + body + hashtags appended naturally + media
 *   - Instagram: caption with hashtags inline, image required
 *   - Facebook: caption (title + body), image optional
 *   - Google Business Profile: short "update" — title, body capped, CTA optional
 *
 * Returns per-channel results so the UI can show which ones succeeded.
 */

import { supabaseAdmin } from '@/lib/supabase-admin'
import type { SupabaseClient } from '@supabase/supabase-js'

export type ChannelKey = 'community' | 'instagram' | 'facebook' | 'google_business'

export interface SourceDraft {
  business_id: string
  post_type?: string                        // update | offer | new_stock | event | story | reel | video
  title?: string | null
  body: string
  hashtags?: string[]
  media_urls?: string[]
  media_type?: 'image' | 'video' | 'reel' | null
  is_story?: boolean                        // applies to Community only
}

export interface ChannelResult {
  channel: ChannelKey
  ok: boolean
  /** id within that channel's own table (community_posts.id, social_posts.id, …) */
  id?: string | null
  error?: string
  /** human label for the channel */
  label: string
}

const LABELS: Record<ChannelKey, string> = {
  community: 'Aria Community',
  instagram: 'Instagram',
  facebook: 'Facebook',
  google_business: 'Google Business',
}

/**
 * Adapt a source draft into the per-channel shape (caption/title trimming etc.).
 * Returned objects are inserted directly into the corresponding table.
 */
export function adaptForChannel(channel: ChannelKey, draft: SourceDraft) {
  const baseHashtags = (draft.hashtags ?? []).filter(Boolean).slice(0, 20)
  const tagLine = baseHashtags.length > 0 ? baseHashtags.map(h => '#' + h.replace(/^#/, '')).join(' ') : ''

  if (channel === 'community') {
    return {
      business_id: draft.business_id,
      post_type: draft.post_type ?? 'update',
      title: draft.title ?? null,
      body: draft.body,
      media_urls: draft.media_urls ?? [],
      media_type: draft.media_type ?? (draft.media_urls && draft.media_urls.length > 0 ? 'image' : null),
      is_story: draft.is_story === true,
      ai_generated: true,
      status: 'published',
      published_at: new Date().toISOString(),
      expires_at: draft.is_story
        ? new Date(Date.now() + 24 * 3600_000).toISOString()
        : null,
    }
  }

  if (channel === 'instagram') {
    // IG: title (if any) + body + hashtags, kept under 2200 chars
    const caption = [draft.title, draft.body].filter(Boolean).join('\n\n').slice(0, 2100)
    return {
      business_id: draft.business_id,
      platform: 'instagram' as const,
      caption: tagLine ? caption + '\n\n' + tagLine : caption,
      hashtags: baseHashtags,
      image_url: draft.media_urls?.[0] ?? null,
      status: 'draft' as const,
      approval_status: 'approved' as const,
    }
  }

  if (channel === 'facebook') {
    const caption = [draft.title, draft.body].filter(Boolean).join('\n\n').slice(0, 5000)
    return {
      business_id: draft.business_id,
      platform: 'facebook' as const,
      caption: tagLine ? caption + '\n\n' + tagLine : caption,
      hashtags: baseHashtags,
      image_url: draft.media_urls?.[0] ?? null,
      status: 'draft' as const,
      approval_status: 'approved' as const,
    }
  }

  // google_business
  // GBP "Update" posts allow up to ~1500 chars summary. Keep it sharp.
  const title = (draft.title ?? '').slice(0, 80) || null
  const body = draft.body.slice(0, 1400)
  return {
    business_id: draft.business_id,
    platform: 'google_business' as const,
    caption: title ? title + '\n\n' + body : body,
    hashtags: baseHashtags,
    image_url: draft.media_urls?.[0] ?? null,
    status: 'draft' as const,
    approval_status: 'approved' as const,
  }
}

/**
 * Publish to a single channel. Returns success/failure with the new row id.
 * For external channels we create the social_posts row (which is what the
 * existing /api/social/publish endpoint operates on), so the actual API push
 * happens by calling that endpoint with the new id.
 */
async function publishToChannel(
  channel: ChannelKey,
  draft: SourceDraft,
  ctx: { reqOrigin?: string; cookieHeader?: string },
): Promise<ChannelResult> {
  const label = LABELS[channel]
  try {
    if (channel === 'community') {
      const row = adaptForChannel('community', draft)
      const { data, error } = await supabaseAdmin.from('community_posts').insert(row).select('id').single()
      if (error) return { channel, ok: false, error: error.message, label }
      // Fan out push notifications (skips stories)
      try {
        const { notifyBusinessFollowers } = await import('./push')
        const { data: biz } = await supabaseAdmin.from('businesses').select('name, logo_url').eq('id', draft.business_id).maybeSingle()
        if (!draft.is_story) {
          await notifyBusinessFollowers(draft.business_id, {
            title: (biz?.name as string | undefined) ?? 'New post',
            body: draft.title ?? draft.body.slice(0, 140),
            url: '/community/businesses/' + draft.business_id,
            icon: (biz?.logo_url as string | undefined) ?? '/icons/icon-192.png',
            tag: 'community-post-' + data!.id,
          })
        }
      } catch { /* push failure is never fatal */ }
      return { channel, ok: true, id: data!.id, label }
    }

    // External channels — must have a connection
    const { data: conn } = await supabaseAdmin.from('social_connections')
      .select('id')
      .eq('business_id', draft.business_id)
      .eq('platform', channel)
      .maybeSingle()
    if (!conn) return { channel, ok: false, error: label + ' is not connected. Connect it on the Social page first.', label }

    const row = adaptForChannel(channel, draft) as Record<string, unknown>
    const { data, error } = await supabaseAdmin.from('social_posts').insert(row).select('id').single()
    if (error) return { channel, ok: false, error: error.message, label }

    // Trigger the existing publish endpoint so the same dispatcher we already
    // trust handles the actual API push. We forward the auth cookie so RLS sees
    // the same owner.
    if (ctx.reqOrigin && ctx.cookieHeader) {
      try {
        const res = await fetch(ctx.reqOrigin + '/api/social/publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', cookie: ctx.cookieHeader },
          body: JSON.stringify({ post_id: data!.id, business_id: draft.business_id }),
        })
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          // Keep the social_post row but report the failure
          return { channel, ok: false, id: data!.id, error: d.error ?? ('HTTP ' + res.status), label }
        }
      } catch (e) {
        return { channel, ok: false, id: data!.id, error: (e as Error).message, label }
      }
    }
    return { channel, ok: true, id: data!.id, label }
  } catch (e) {
    return { channel, ok: false, error: (e as Error).message, label }
  }
}

/**
 * Cross-post to multiple channels in one shot. Returns a per-channel summary.
 *
 * `supabase` is the request-scoped client used purely for the ownership check
 * (the actual writes go through the service-role supabaseAdmin).
 */
export async function crossPost(
  supabase: SupabaseClient,
  user_id: string,
  draft: SourceDraft,
  channels: ChannelKey[],
  ctx: { reqOrigin?: string; cookieHeader?: string } = {},
): Promise<{ results: ChannelResult[]; any_ok: boolean }> {
  // Ownership check — never publish on behalf of a business the user doesn't own
  const { data: biz } = await supabase.from('businesses').select('id').eq('id', draft.business_id).eq('user_id', user_id).maybeSingle()
  if (!biz) {
    return {
      results: channels.map(c => ({ channel: c, ok: false, error: 'Forbidden', label: LABELS[c] })),
      any_ok: false,
    }
  }

  const unique = Array.from(new Set(channels)).filter((c): c is ChannelKey => c in LABELS)
  const results: ChannelResult[] = []
  for (const c of unique) {
    results.push(await publishToChannel(c, draft, ctx))
  }
  return { results, any_ok: results.some(r => r.ok) }
}

export { LABELS as CHANNEL_LABELS }
