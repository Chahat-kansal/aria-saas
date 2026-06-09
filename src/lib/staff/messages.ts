import { supabaseAdmin } from '@/lib/supabase-admin'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function sendStaffMessage(opts: {
  businessId: string
  senderId: string
  recipientId: string | null
  subject: string
  body: string
  isBroadcast: boolean
}): Promise<string | null> {
  const { data, error } = await supabaseAdmin.from('staff_messages').insert({
    business_id: opts.businessId,
    sender_id: opts.senderId,
    recipient_id: opts.recipientId,
    subject: opts.subject,
    body: opts.body,
    is_broadcast: opts.isBroadcast,
  }).select('id').single()
  if (error) return null
  return (data as { id: string } | null)?.id ?? null
}

export async function getMessagesForBusiness(
  businessId: string,
  limit = 50,
): Promise<unknown[]> {
  const supabase = createServerSupabaseClient()
  const { data } = await supabase.from('staff_messages')
    .select(`
      id, subject, body, is_broadcast, recipient_id, read_at, created_at,
      sender:sender_id(first_name, last_name, color),
      recipient:recipient_id(first_name, last_name)
    `)
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(limit)
  return data ?? []
}

export async function getActiveAnnouncements(businessId: string): Promise<unknown[]> {
  const supabase = createServerSupabaseClient()
  const { data } = await supabase.from('staff_announcements')
    .select('id, title, body, priority, expires_at, created_at')
    .eq('business_id', businessId)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order('created_at', { ascending: false })
    .limit(20)
  return data ?? []
}
