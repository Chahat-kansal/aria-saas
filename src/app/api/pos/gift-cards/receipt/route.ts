export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { data: card } = await supabase
    .from('pos_gift_cards')
    .select('id, code, balance, initial_balance, recipient_name, personal_message, expires_at, created_at, businesses(name, city)')
    .eq('id', id).maybeSingle()
  if (!card) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({
    receipt: {
      code: card.code,
      recipient_name: card.recipient_name,
      personal_message: card.personal_message,
      balance: card.balance,
      initial_balance: card.initial_balance,
      expires_at: card.expires_at,
      issued_at: card.created_at,
      business_name: (card.businesses as unknown as { name: string } | null)?.name,
    }
  })
}
export const GET = withErrorCapture('pos/gift-cards/receipt', _GET)
