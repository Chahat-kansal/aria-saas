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

// CANONICAL = pos_customers. Columns it natively has from the import field set; everything else the
// AI mapper can produce (company/address/city/postcode/…) is preserved in custom_fields jsonb rather
// than dropped. name is NOT NULL on pos_customers, so fall back to email/phone when missing.
const POS_DIRECT_FIELDS = new Set(['name', 'email', 'phone', 'notes', 'tags'])
const CONSENT_FIELDS = new Set(['marketing_consent', 'sms_consent', 'email_consent'])
const CONSENT_TRUTHY = new Set(['true', 'yes', 'y', '1', 'opted in', 'opt-in', 'opt in', 'subscribed'])
function toPosCustomerRow(mapped: Record<string, unknown>, businessId: string): Record<string, unknown> {
  const row: Record<string, unknown> = { business_id: businessId, source: 'csv_import' }
  const custom: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(mapped)) {
    if (POS_DIRECT_FIELDS.has(k)) row[k] = v
    else if (!CONSENT_FIELDS.has(k)) custom[k] = v
  }
  if (!row.name) row.name = (mapped.email as string) || (mapped.phone as string) || 'Imported customer'
  if (Object.keys(custom).length > 0) row.custom_fields = custom

  // CONSENT-COLLECTION-1: importing a list is NOT consent. Default both channel flags false
  // (DB default) + provenance 'import'. Honour an explicit consent column ONLY if the owner
  // mapped one in the file — then stamp captured_at.
  row.consent_source = 'import'
  const truthy = (v: unknown) => CONSENT_TRUTHY.has(String(v ?? '').trim().toLowerCase())
  if ([...CONSENT_FIELDS].some(k => k in mapped)) {
    const sms = 'sms_consent' in mapped ? truthy(mapped.sms_consent) : truthy(mapped.marketing_consent)
    const email = 'email_consent' in mapped ? truthy(mapped.email_consent) : truthy(mapped.marketing_consent)
    row.sms_consent = sms
    row.email_consent = email
    row.marketing_consent = sms || email
    row.consent_captured_at = new Date().toISOString()
  }
  return row
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

  // Load existing emails + phones for dedup within this business — CANONICAL pos_customers only.
  const { data: existing } = await supabaseAdmin
    .from('pos_customers').select('email, phone').eq('business_id', businessId).is('deleted_at', null)
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
    toInsert.push(toPosCustomerRow(mapped, businessId))
    if (em) emails.add(em)
    if (ph) phones.add(ph)
  }

  if (toInsert.length > 0) {
    const { error } = await supabaseAdmin.from('pos_customers').insert(toInsert)
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
