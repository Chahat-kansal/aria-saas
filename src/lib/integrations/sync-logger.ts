import { supabaseAdmin } from '@/lib/supabase-admin'

export async function logSyncStart(
  businessId: string,
  integrationKey: string,
  eventType: string,
): Promise<string> {
  const { data } = await supabaseAdmin.from('pos_integration_sync_events').insert({
    business_id: businessId,
    integration_key: integrationKey,
    event_type: eventType,
    status: 'running',
    records_count: 0,
    started_at: new Date().toISOString(),
  }).select('id').single()
  return (data as { id: string } | null)?.id ?? ''
}

export async function logSyncComplete(
  eventId: string,
  recordsCount: number,
  errorMessage?: string,
): Promise<void> {
  if (!eventId) return
  await supabaseAdmin.from('pos_integration_sync_events').update({
    status: errorMessage ? 'error' : 'success',
    records_count: recordsCount,
    error_message: errorMessage ?? null,
    completed_at: new Date().toISOString(),
  }).eq('id', eventId)
}

export async function getLastSync(
  businessId: string,
  integrationKey: string,
): Promise<{ status: string; records_count: number; started_at: string } | null> {
  const { data } = await supabaseAdmin.from('pos_integration_sync_events')
    .select('status, records_count, started_at')
    .eq('business_id', businessId)
    .eq('integration_key', integrationKey)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data ?? null
}
