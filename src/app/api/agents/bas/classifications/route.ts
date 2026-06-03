export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: biz } = await supabaseAdmin
    .from('businesses').select('id').eq('user_id', user.id).eq('is_active', true).limit(1).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  const { data, error } = await supabaseAdmin
    .from('product_tax_classifications')
    .select('id,product_id,gst_treatment,ato_tax_code,classification_source,ai_confidence,notes,classified_at,pos_products(name,category)')
    .eq('business_id', biz.id)
    .order('classified_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ classifications: data ?? [] })
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: biz } = await supabaseAdmin
    .from('businesses').select('id').eq('user_id', user.id).eq('is_active', true).limit(1).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const body = await req.json().catch(() => null) as { gst_treatment?: string; notes?: string } | null
  if (!body) return NextResponse.json({ error: 'Body required' }, { status: 400 })

  const validTreatments = ['taxable', 'gst_free', 'input_taxed', 'out_of_scope']
  if (body.gst_treatment && !validTreatments.includes(body.gst_treatment)) {
    return NextResponse.json({ error: 'Invalid gst_treatment' }, { status: 400 })
  }

  const ataCodeMap: Record<string, string> = { taxable: '1A', gst_free: '5A', input_taxed: '7A', out_of_scope: 'N/A' }

  const { error } = await supabaseAdmin
    .from('product_tax_classifications')
    .update({
      gst_treatment: body.gst_treatment,
      ato_tax_code: body.gst_treatment ? ataCodeMap[body.gst_treatment] : undefined,
      classification_source: 'confirmed',
      notes: body.notes,
      classified_at: new Date().toISOString(),
      classified_by: 'owner',
    })
    .eq('id', id)
    .eq('business_id', biz.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('agents/bas/classifications', _GET)
export const PATCH = withErrorCapture('agents/bas/classifications', _PATCH)
