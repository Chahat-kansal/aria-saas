export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { withErrorCapture, withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'
import { simplifyDebts } from '@/lib/pos/iou-simplifier'

async function _POST(req: Request, _context: unknown, { supabase, businessId: bid }: BusinessContext) {
  const { group_id } = await req.json()
  if (!group_id) return NextResponse.json({ error: 'group_id required' }, { status: 400 })

  // Fetch all pending IOUs for group
  const { data: ious } = await supabase.from('split_ious').select('id, from_member_id, to_member_id, from_name, to_name, amount').eq('group_id', group_id).eq('status', 'pending')
  if (!ious?.length) return NextResponse.json({ before_count: 0, after_count: 0, simplified: [] })

  // Fetch members
  const { data: members } = await supabase.from('split_group_members').select('id, name, current_balance').eq('group_id', group_id).eq('is_active', true)

  // Build net balances from IOUs
  const balanceMap: Record<string, { id: string; name: string; balance: number }> = {}
  for (const m of members ?? []) {
    balanceMap[m.id] = { id: m.id, name: m.name, balance: 0 }
  }
  for (const iou of ious) {
    if (balanceMap[iou.to_member_id]) balanceMap[iou.to_member_id].balance += iou.amount
    if (balanceMap[iou.from_member_id]) balanceMap[iou.from_member_id].balance -= iou.amount
  }

  const simplified = simplifyDebts(Object.values(balanceMap))

  if (simplified.length < ious.length) {
    // Cancel all pending IOUs
    await supabase.from('split_ious').update({ status: 'cancelled' }).eq('group_id', group_id).eq('status', 'pending')

    // Create simplified IOUs
    if (simplified.length > 0) {
      await supabase.from('split_ious').insert(
        simplified.map(s => ({
          business_id: bid,
          group_id,
          from_member_id: s.from_id,
          to_member_id: s.to_id,
          from_name: s.from_name,
          to_name: s.to_name,
          amount: s.amount,
          status: 'pending',
          notes: 'Simplified by Aria',
          created_at: new Date().toISOString(),
        }))
      )
    }
  }

  return NextResponse.json({
    before_count: ious.length,
    after_count: simplified.length,
    savings: ious.length - simplified.length,
    simplified,
  })
}

export const POST = withBusinessContext('pos/split-ious/simplify', _POST)