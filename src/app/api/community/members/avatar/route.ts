export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { getCommunityMember } from '@/lib/community/session'
import { supabaseAdmin } from '@/lib/supabase-admin'

// CX-ACCOUNT-CENTRE-1 — member avatar upload. upload-media is owner-gated (needs a business_id), so
// members get their own image-only upload scoped to their session. Stores to Vercel Blob and sets
// community_members.avatar_url.
export async function POST(req: Request) {
  try {
    const member = await getCommunityMember()
    if (!member) return NextResponse.json({ error: 'Join the community first.' }, { status: 401 })

    let formData: FormData
    try { formData = await req.formData() } catch {
      return NextResponse.json({ error: 'Invalid multipart body' }, { status: 400 })
    }
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 })
    if (!file.type.startsWith('image/')) return NextResponse.json({ error: 'Avatar must be an image.' }, { status: 400 })
    if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: 'Image must be under 5MB.' }, { status: 400 })

    const safeName = (file.name || 'avatar.jpg').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-40)
    const blob = await put(`community/members/${member.id}/${Date.now()}-${safeName}`, file, { access: 'public' })

    await supabaseAdmin.from('community_members').update({ avatar_url: blob.url }).eq('id', member.id)
    return NextResponse.json({ ok: true, avatar_url: blob.url })
  } catch (err) {
    console.error('[community/members/avatar]', err)
    return NextResponse.json({ error: 'Upload failed — please try again.' }, { status: 500 })
  }
}
