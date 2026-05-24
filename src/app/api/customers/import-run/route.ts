export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'

type CsvRow = Record<string, string>

function mapRow(
  row: CsvRow,
  mapping: Record<string, string>,
): Record<string, unknown> | null {
  const out: Record<string, unknown> = {}
  for (const [header, field] of Object.entries(mapping)) {
    const val = (row[header] ?? '').trim()
    if (!val || field === 'ignore') continue
    if (field === 'tags') {
      out.tags = val.split(/[,;]/).map(t => t.trim()).filter(Boolean)
    } else {
      out[field] = val
    }
  }
  if (!out.name && !out.email && !out.phone) return null
  return out
}

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { jobId, businessId, mapping, rows } = body
  if (!businessId || !mapping || !Array.isArray(rows)) {
    return NextResponse.json({ error: 'businessId, mapping, and rows required' }, { status: 400 })
  }

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', businessId).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Load existing emails + phones for dedup within this business
  const { data: existing } = await supabaseAdmin
    .from('customers').select('email, phone').eq('business_id', businessId)
  const emails = new Set<string>((existing ?? []).map(c => c.email).filter(Boolean) as string[])
  const phones = new Set<string>((existing ?? []).map(c => c.phone).filter(Boolean) as string[])

  let skipped = 0
  const toInsert: Record<string, unknown>[] = []

  for (const row of rows as CsvRow[]) {
    const mapped = mapRow(row, mapping)
    if (!mapped) { skipped++; continue }
    const em = mapped.email as string | undefined
    const ph = mapped.phone as string | undefined
    if ((em && emails.has(em)) || (ph && phones.has(ph))) { skipped++; continue }
    toInsert.push({ ...mapped, business_id: businessId, source: 'csv_import', archived: false })
    if (em) emails.add(em)
    if (ph) phones.add(ph)
  }

  if (toInsert.length > 0) {
    const { error } = await supabaseAdmin.from('customers').insert(toInsert)
    if (error) {
      if (jobId) {
        await supabaseAdmin.from('customer_import_jobs')
          .update({ status: 'failed', error_detail: error.message }).eq('id', jobId)
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  const imported = toInsert.length
  if (jobId) {
    await supabaseAdmin.from('customer_import_jobs').update({
      status: 'complete',
      rows_total: (rows as CsvRow[]).length,
      rows_imported: imported,
      rows_skipped: skipped,
      column_mapping: mapping,
    }).eq('id', jobId)
  }

  return NextResponse.json({ imported, skipped })
}
