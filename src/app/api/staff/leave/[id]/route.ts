export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { sendSMS } from '@/lib/clicksend'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

type Params = { params: Promise<{ id: string }> | { id: string } }

async function _PATCH(req: Request, { params }: Params) {
  const { id } = 'then' in params ? await params : params
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { status?: string }

  // Verify this leave belongs to a business owned by user
  const { data: biz } = await supabase.from('businesses').select('id')
    .eq('user_id', user.id).eq('is_active', true).limit(1).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'No business' }, { status: 404 })

  const { data, error: e } = await supabaseAdmin.from('staff_leave')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('business_id', biz.id)
    .select('*, staff_members(first_name, last_name, mobile)')
    .single()
  if (e) return NextResponse.json({ error: e.message }, { status: 500 })

  if (body.status === 'approved') {
    const row = data as Record<string, unknown>
    const sm = row.staff_members as { first_name: string; mobile: string | null } | null
    const sid = process.env.TWILIO_ACCOUNT_SID ?? ''
    const token = process.env.TWILIO_AUTH_TOKEN ?? ''
    const from = process.env.TWILIO_PHONE_NUMBER ?? ''
    if (sid && token && from && sm?.mobile) {
      const leaveType = String(row.leave_type ?? 'leave').replace(/_/g, ' ')
      const msg = `Hi ${sm.first_name}, your ${leaveType} request from ${row.start_date} to ${row.end_date} has been approved.`
        await sendSMS(sm.mobile, msg)
        method: 'POST',
        headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ To: sm.mobile, From: from, Body: msg }).toString(),
      }).catch(() => { /* non-fatal */ })
    }
  }

  return NextResponse.json({ leave: data })
}

export const PATCH = withErrorCapture('staff/leave/[id]', _PATCH)
