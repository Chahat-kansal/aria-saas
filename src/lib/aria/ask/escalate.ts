import { supabaseAdmin } from '@/lib/supabase-admin'

interface EscalateOpts {
  businessId: string
  userEmail: string
  subject: string
  message: string
  category?: string
  conversationId?: string
  ariaDiagnosis?: string
}

export async function createSupportTicket(opts: EscalateOpts): Promise<{ id: string }> {
  const { data, error } = await supabaseAdmin.from('support_tickets').insert({
    business_id: opts.businessId,
    user_email: opts.userEmail,
    subject: opts.subject,
    message: opts.message,
    status: 'open',
    priority: 'normal',
    source: 'aria',
    aria_attempted: true,
    aria_diagnosis: opts.ariaDiagnosis ?? null,
    conversation_id: opts.conversationId ?? null,
    category: opts.category ?? 'general',
  }).select('id').single()

  if (error) throw new Error(`Failed to create support ticket: ${error.message}`)
  return { id: data.id as string }
}
