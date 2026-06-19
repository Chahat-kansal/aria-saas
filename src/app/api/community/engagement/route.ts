export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { COMMUNITY_BUSINESS_CARD } from '@/lib/community/query-helpers'
import { ensureCommunityMember, getCommunityMember } from '@/lib/community/session'
import { notifyEngagement } from '@/lib/community/notifications'

const VALID_TYPES = new Set(['like', 'comment', 'save', 'view', 'share'])

// Light comment privacy guard — block obvious phone / email / card patterns
const PHONE_RE = /(?:\+?61|0)\s?\d(?:[\s-]?\d){7,9}/
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/
const CARD_RE  = /\b(?:\d[ -]?){13,19}\b/

function commentIsBlocked(text: string): { blocked: boolean; reason?: string } {
  if (PHONE_RE.test(text)) return { blocked: true, reason: 'Phone numbers can\'t be shared in comments — sort it in person at the shop.' }
  if (EMAIL_RE.test(text)) return { blocked: true, reason: 'Email addresses can\'t be shared in comments — sort it in person at the shop.' }
  if (CARD_RE.test(text))  return { blocked: true, reason: 'Numbers that look like card details can\'t be shared.' }
  return { blocked: false }
}

// POST — toggle/insert engagement. Anonymous member (resolved via session cookie).
// Body: { post_id, type: like|save|share|view|comment, comment_text? }
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({})) as { post_id?: string; type?: string; comment_text?: string; parent_id?: string }
    if (!body.post_id || !body.type || !VALID_TYPES.has(body.type)) {
      return NextResponse.json({ error: 'post_id and a valid type are required.' }, { status: 400 })
    }

    // Verify the post exists + is published
    const { data: post } = await supabaseAdmin.from('community_posts')
      .select('id, business_id, status').eq('id', body.post_id).maybeSingle()
    if (!post || post.status !== 'published') {
      return NextResponse.json({ error: 'Post not found.' }, { status: 404 })
    }

    // Comments — apply privacy guard before insert
    if (body.type === 'comment') {
      const txt = (body.comment_text ?? '').toString().trim().slice(0, 600)
      if (!txt) return NextResponse.json({ error: 'Comment is empty.' }, { status: 400 })
      const guard = commentIsBlocked(txt)
      if (guard.blocked) {
        return NextResponse.json({ blocked: true, error: guard.reason }, { status: 400 })
      }
      // CX-POLISH-3: optional reply. Validate the parent is a comment on THIS post; flatten replies-to-
      // replies onto the top-level comment (max 1 level deep, Instagram-style).
      let parentId: string | null = null
      if (body.parent_id) {
        const { data: parent } = await supabaseAdmin.from('community_post_engagement')
          .select('id, post_id, engagement_type, parent_id').eq('id', body.parent_id).maybeSingle()
        if (!parent || parent.post_id !== body.post_id || parent.engagement_type !== 'comment') {
          return NextResponse.json({ error: 'Invalid parent comment.' }, { status: 400 })
        }
        parentId = (parent.parent_id as string | null) ?? (parent.id as string)
      }
      // Comments require a member (so the owner can identify which device commented)
      const member = await ensureCommunityMember()
      const { data, error } = await supabaseAdmin.from('community_post_engagement').insert({
        post_id: body.post_id,
        member_id: member.id,
        engagement_type: 'comment',
        comment_text: txt,
        parent_id: parentId,
      }).select('id, created_at').single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      // CX-POLISH-1: notify the post's owner — fire-and-forget, never blocks the comment.
      void notifyEngagement({ postId: body.post_id, businessId: post.business_id, actorMemberId: member.id, kind: 'new_comment' })
      return NextResponse.json({ ok: true, comment_id: data?.id, created_at: data?.created_at, parent_id: parentId })
    }

    // Views — anonymous-allowed, dedupe per (member, post) — best-effort, single insert per session
    if (body.type === 'view') {
      const member = await getCommunityMember()
      if (!member) {
        // Anonymous never-joined visitor — count once per request, no dedupe possible without a member_id
        await supabaseAdmin.from('community_post_engagement').insert({
          post_id: body.post_id, member_id: null, engagement_type: 'view',
        }).then(undefined, () => null)
        return NextResponse.json({ ok: true })
      }
      // Joined visitor — only insert if no view exists yet for this (member, post)
      const { count } = await supabaseAdmin.from('community_post_engagement')
        .select('id', { count: 'exact', head: true })
        .eq('post_id', body.post_id).eq('member_id', member.id).eq('engagement_type', 'view')
      if ((count ?? 0) === 0) {
        await supabaseAdmin.from('community_post_engagement').insert({
          post_id: body.post_id, member_id: member.id, engagement_type: 'view',
        })
      }
      return NextResponse.json({ ok: true })
    }

    // Like / save — toggle (remove if exists, insert if not)
    if (body.type === 'like' || body.type === 'save') {
      const member = await ensureCommunityMember()
      const { data: existing } = await supabaseAdmin.from('community_post_engagement')
        .select('id').eq('post_id', body.post_id).eq('member_id', member.id).eq('engagement_type', body.type)
        .limit(1).maybeSingle()
      if (existing) {
        await supabaseAdmin.from('community_post_engagement').delete().eq('id', existing.id)
        return NextResponse.json({ ok: true, on: false })
      }
      await supabaseAdmin.from('community_post_engagement').insert({
        post_id: body.post_id, member_id: member.id, engagement_type: body.type,
      })
      // CX-POLISH-1: only a NEW like (not save, not un-like) pings the owner — fire-and-forget.
      if (body.type === 'like') {
        void notifyEngagement({ postId: body.post_id, businessId: post.business_id, actorMemberId: member.id, kind: 'new_like' })
      }
      return NextResponse.json({ ok: true, on: true })
    }

    // Share — log every share (no toggle, no dedupe — counts every share button press)
    if (body.type === 'share') {
      const member = await getCommunityMember()
      await supabaseAdmin.from('community_post_engagement').insert({
        post_id: body.post_id, member_id: member?.id ?? null, engagement_type: 'share',
      })
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unhandled type' }, { status: 400 })
  } catch (err) {
    console.error('[community/engagement]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// GET — comments for a post (public, anonymous read OK)
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const post_id = searchParams.get('post_id')
    if (!post_id) return NextResponse.json({ error: 'post_id required' }, { status: 400 })

    // CX-1-P3: also return the post itself (PostCardData-compatible) so the post-detail page renders
    // from one call. Backward-compatible — `comments` is unchanged.
    const [{ data }, { data: postRow }, { data: engRows }] = await Promise.all([
      supabaseAdmin.from('community_post_engagement')
        .select('id, comment_text, created_at, parent_id, member_id, community_members(nickname)')
        .eq('post_id', post_id).eq('engagement_type', 'comment')
        .order('created_at', { ascending: false }).limit(200),
      supabaseAdmin.from('community_posts')
        .select(`id, business_id, post_type, title, body, media_urls, media_type, ai_generated, published_at, ${COMMUNITY_BUSINESS_CARD}`)
        .eq('id', post_id).eq('status', 'published').maybeSingle(),
      supabaseAdmin.from('community_post_engagement')
        .select('engagement_type').eq('post_id', post_id).in('engagement_type', ['like', 'save', 'comment']),
    ])

    // CX-POLISH-3 — nest replies (parent_id) under their top-level comment. Top-level stays newest-first
    // (so the feed card's top-3 preview is unchanged); replies are ordered oldest-first within a thread.
    type Row = { id: string; comment_text: string | null; created_at: string; parent_id: string | null; member_id: string | null; community_members: { nickname: string | null } | null }
    const rows = (data ?? []) as unknown as Row[]
    const mapRow = (c: Row) => ({ id: c.id, text: c.comment_text, nickname: c.community_members?.nickname ?? 'Anonymous', created_at: c.created_at, member_id: c.member_id })
    const repliesByParent: Record<string, ReturnType<typeof mapRow>[]> = {}
    for (const r of rows) {
      if (r.parent_id) (repliesByParent[r.parent_id] ??= []).push(mapRow(r))
    }
    for (const k in repliesByParent) repliesByParent[k].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    const comments = rows.filter(r => !r.parent_id).map(c => ({ ...mapRow(c), replies: repliesByParent[c.id] ?? [] }))

    const counts = { like: 0, comment: 0, save: 0 }
    for (const e of (engRows ?? []) as Array<{ engagement_type: string }>) {
      if (e.engagement_type === 'like' || e.engagement_type === 'save' || e.engagement_type === 'comment') counts[e.engagement_type]++
    }
    const pr = postRow as Record<string, unknown> | null
    const post = pr ? {
      id: pr.id, business_id: pr.business_id, business: pr.businesses,
      post_type: pr.post_type, title: pr.title, body: pr.body,
      media_urls: Array.isArray(pr.media_urls) ? pr.media_urls : [],
      media_type: pr.media_type, ai_generated: pr.ai_generated ?? false,
      published_at: pr.published_at, counts, mine: { liked: false, saved: false },
    } : null

    return NextResponse.json({ post, comments })
  } catch (err) {
    console.error('[community/engagement GET]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
