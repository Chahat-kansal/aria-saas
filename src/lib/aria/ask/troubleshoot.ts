import { supabaseAdmin } from '@/lib/supabase-admin'

export interface TroubleshootContext {
  hardware_devices: Array<{
    id: string
    device_type: string
    label: string | null
    status: string | null
    last_seen_at: string | null
    firmware_version: string | null
  }>
  recent_sync_errors: number
  last_sale_at: string | null
}

export async function buildTroubleshootContext(businessId: string): Promise<TroubleshootContext> {
  const oneDayAgo = new Date(Date.now() - 86400_000).toISOString()

  const [devicesRes, syncRes, lastSaleRes] = await Promise.all([
    supabaseAdmin.from('pos_hardware_devices').select('id,device_type,label,status,last_seen_at,firmware_version').eq('business_id', businessId).limit(20),
    supabaseAdmin.from('pos_integration_sync_events').select('id', { count: 'exact', head: true }).eq('business_id', businessId).eq('status', 'error').gte('created_at', oneDayAgo),
    supabaseAdmin.from('pos_sales').select('created_at').eq('business_id', businessId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  return {
    hardware_devices: (devicesRes.data ?? []).map((d: Record<string, unknown>) => ({
      id: String(d.id),
      device_type: String(d.device_type ?? 'unknown'),
      label: d.label ? String(d.label) : null,
      status: d.status ? String(d.status) : null,
      last_seen_at: d.last_seen_at ? String(d.last_seen_at) : null,
      firmware_version: d.firmware_version ? String(d.firmware_version) : null,
    })),
    recent_sync_errors: Number(syncRes.count) || 0,
    last_sale_at: lastSaleRes.data?.created_at ?? null,
  }
}

export function buildTroubleshootAddendum(ctx: TroubleshootContext): string {
  const devices = ctx.hardware_devices.length > 0
    ? ctx.hardware_devices.map(d => `- ${d.device_type}${d.label ? ` (${d.label})` : ''}: ${d.status ?? 'unknown'}, last seen ${d.last_seen_at ? new Date(d.last_seen_at).toLocaleString() : 'never'}`).join('\n')
    : 'No devices registered'

  return `\n\n## Live Device Status
${devices}

Sync errors (last 24h): ${ctx.recent_sync_errors}
Last sale recorded: ${ctx.last_sale_at ? new Date(ctx.last_sale_at).toLocaleString() : 'None on record'}`
}
