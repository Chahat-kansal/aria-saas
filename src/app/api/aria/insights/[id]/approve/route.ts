export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'

async function _POST(_req: Request, context: { params: Promise<{ id: string }> | { id: string } }, { supabase, businessId: bid }: BusinessContext) {
  const { id } = 'then' in context.params ? await context.params : context.params

  const { error } = await supabase
    .from('aria_actions')
    .update({ status: 'approved', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('business_id', bid)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export const POST = withBusinessContext('aria/insights/approve', _POST)