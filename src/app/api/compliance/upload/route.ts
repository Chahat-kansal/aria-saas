export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })

  const file = form.get('file') as File | null
  const itemId = form.get('itemId') as string | null
  if (!file || !itemId) return NextResponse.json({ error: 'file and itemId required' }, { status: 400 })

  const blob = await put(`compliance/${itemId}/${file.name}`, file, { access: 'public' })

  await supabaseAdmin.from('compliance_items').update({ document_url: blob.url }).eq('id', itemId)

  return NextResponse.json({ url: blob.url })
}
