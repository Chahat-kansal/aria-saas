export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { normalisePhone } from '@/lib/clicksend'

export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const bid = await resolveBusinessId(supabaseAdmin, params.slug)
  if (!bid) return NextResponse.json({ found: false }, { status: 404 })

  let body: { phone?: string } = {}
  try { body = await req.json() } catch { /* empty body ok */ }

  const raw = (body.phone ?? '').trim()
  if (!raw) return NextResponse.json({ found: false })

  let phone = raw
  try { phone = normalisePhone(raw) } catch { /* keep raw */ }

  type CustomerRow = {
    id: string; name: string; points_balance: number | null; loyalty_tier: string | null
    visit_count: number | null; stamps_count: number | null; total_spent: string | null
    last_visit_at: string | null
  }

  const COLS = 'id, name, points_balance, loyalty_tier, visit_count, stamps_count, total_spent, last_visit_at'

  // Try normalised phone first, then raw (handles legacy un-normalised rows)
  let customer: CustomerRow | null = null
  const { data: byNorm } = await supabaseAdmin
    .from('pos_customers')
    .select(COLS)
    .eq('business_id', bid)
    .eq('phone', phone)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  customer = byNorm as CustomerRow | null

  if (!customer && phone !== raw) {
    const { data: byRaw } = await supabaseAdmin
      .from('pos_customers')
      .select(COLS)
      .eq('business_id', bid)
      .eq('phone', raw)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    customer = byRaw as CustomerRow | null
  }

  if (!customer) return NextResponse.json({ found: false })

  return NextResponse.json({
    found: true,
    customer_id: customer.id,
    name: customer.name,
    points_balance: Number(customer.points_balance) || 0,
    loyalty_tier: customer.loyalty_tier ?? null,
    visit_count: Number(customer.visit_count) || 0,
    stamps_count: Number(customer.stamps_count) || 0,
    total_spent: (Number(customer.total_spent) || 0).toFixed(2),
    last_visit_at: customer.last_visit_at ?? null,
  })
}