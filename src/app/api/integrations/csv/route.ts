export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { importCSV } from '@/lib/integrations/csv-importer'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const contentType = req.headers.get('content-type') ?? ''

  let csvText = ''
  let source = 'csv_import'

  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    if (!file.name.endsWith('.csv') && !file.type.includes('csv') && !file.type.includes('text')) {
      return NextResponse.json({ error: 'File must be a CSV' }, { status: 400 })
    }
    csvText = await file.text()
    source = String(formData.get('source') ?? 'csv_import')
  } else {
    const body = await req.json().catch(() => ({})) as { csv?: string; source?: string }
    if (!body.csv) return NextResponse.json({ error: 'csv field required' }, { status: 400 })
    csvText = body.csv
    source = body.source ?? 'csv_import'
  }

  if (!csvText.trim()) return NextResponse.json({ error: 'Empty CSV' }, { status: 400 })

  const result = await importCSV(bid, csvText, source)
  return NextResponse.json({ ok: true, ...result }, { status: result.errors.length ? 207 : 201 })
}

export const POST = withErrorCapture('integrations/csv', _POST)
