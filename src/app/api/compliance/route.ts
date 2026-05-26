export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

const SEED: Record<string, Array<{ title: string; description: string; category: string; priority: 'high' | 'medium' | 'low' }>> = {
  liquor_store: [
    { title: 'RSA Certification', description: 'All staff serving alcohol must hold a valid RSA certificate.', category: 'liquor', priority: 'high' },
    { title: 'Liquor Licence Display', description: 'Current liquor licence must be displayed at the premises.', category: 'liquor', priority: 'high' },
    { title: 'CCTV Operational', description: 'CCTV system must be operational and recording at all times.', category: 'general', priority: 'medium' },
    { title: 'Minors Policy Posted', description: 'ID checking policy for minors must be prominently displayed.', category: 'liquor', priority: 'high' },
    { title: 'ID Checking Policy', description: 'Written policy for checking IDs of customers who appear under 25.', category: 'liquor', priority: 'high' },
    { title: 'ATO BAS Lodgement', description: 'Business Activity Statement must be lodged each quarter.', category: 'tax', priority: 'high' },
    { title: 'WorkCover Insurance', description: 'Current WorkCover insurance for all employees.', category: 'insurance', priority: 'high' },
    { title: 'Public Liability Insurance', description: 'Minimum $10M public liability insurance policy.', category: 'insurance', priority: 'high' },
  ],
  cafe: [
    { title: 'Food Safety Supervisor Certificate', description: 'At least one certified food safety supervisor must be on premises.', category: 'food_safety', priority: 'high' },
    { title: 'Council Food Premises Approval', description: 'Council registration for food premises must be current.', category: 'food_safety', priority: 'high' },
    { title: 'WorkCover Insurance', description: 'Current WorkCover insurance for all employees.', category: 'insurance', priority: 'high' },
    { title: 'Public Liability Insurance', description: 'Minimum $10M public liability insurance policy.', category: 'insurance', priority: 'high' },
    { title: 'Menu Allergen Display', description: 'Allergen information must be available for all menu items.', category: 'food_safety', priority: 'medium' },
    { title: 'Fair Work Compliance', description: 'Employment contracts, awards, and pay records must comply with Fair Work Act.', category: 'employment', priority: 'high' },
  ],
  retail: [
    { title: 'WorkCover Insurance', description: 'Current WorkCover insurance for all employees.', category: 'insurance', priority: 'high' },
    { title: 'Public Liability Insurance', description: 'Minimum $10M public liability insurance policy.', category: 'insurance', priority: 'high' },
    { title: 'Fire Safety Compliance', description: 'Fire extinguishers serviced, smoke detectors operational, evacuation plan posted.', category: 'fire', priority: 'high' },
    { title: 'ATO BAS Lodgement', description: 'Business Activity Statement must be lodged each quarter.', category: 'tax', priority: 'high' },
  ],
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const business_id = searchParams.get('business_id')
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (searchParams.get('action') === 'seed') {
    const raw = searchParams.get('industry') ?? 'retail'
    const key = raw.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z_]/g, '')
    const templates = SEED[key] ?? SEED.retail
    const rows = templates.map(t => ({ ...t, business_id, status: 'pending', industry: key }))
    const { data: inserted, error: ie } = await supabaseAdmin.from('compliance_items').insert(rows).select()
    if (ie) return NextResponse.json({ error: ie.message }, { status: 500 })
    return NextResponse.json({ items: inserted ?? [] })
  }

  const { data, error: e } = await supabaseAdmin
    .from('compliance_items')
    .select('id,title,description,category,status,priority,due_date,expiry_date,evidence_note,evidence_url,document_url,reminder_enabled')
    .eq('business_id', business_id)
    .order('created_at', { ascending: true })

  if (e) return NextResponse.json({ items: [] })
  return NextResponse.json({ items: data ?? [] })
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { id, ...rest } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const allowed = ['status', 'evidence_note', 'evidence_url', 'document_url', 'reminder_enabled']
  const update: Record<string, unknown> = {}
  for (const k of allowed) if (k in rest) update[k] = rest[k]
  if (Object.keys(update).length === 0) return NextResponse.json({ ok: true })

  const { error: e } = await supabaseAdmin.from('compliance_items').update(update).eq('id', id)
  if (e) return NextResponse.json({ error: e.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('compliance', _GET)
export const PATCH = withErrorCapture('compliance', _PATCH)
