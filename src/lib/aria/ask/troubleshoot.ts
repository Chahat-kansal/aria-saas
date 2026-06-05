import { supabaseAdmin } from '@/lib/supabase-admin'
import { checkAppHealth } from './app-health'
import type { RouteHealth, SentryIssue } from './app-health'

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
  route_health?: RouteHealth[]
  broken_routes?: RouteHealth[]
  all_routes_ok?: boolean
  sentry_issues?: SentryIssue[]
  sentry_note?: string
}

export async function buildTroubleshootContext(businessId: string): Promise<TroubleshootContext> {
  const oneDayAgo = new Date(Date.now() - 86400_000).toISOString()

  const [devicesRes, syncRes, lastSaleRes, appHealth] = await Promise.all([
    supabaseAdmin.from('pos_hardware_devices').select('id,device_type,label,status,last_seen_at,firmware_version').eq('business_id', businessId).limit(20),
    supabaseAdmin.from('pos_integration_sync_events').select('id', { count: 'exact', head: true }).eq('business_id', businessId).eq('status', 'error').gte('created_at', oneDayAgo),
    supabaseAdmin.from('pos_sales').select('created_at').eq('business_id', businessId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    checkAppHealth().catch(() => null),
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
    route_health: appHealth?.route_health,
    broken_routes: appHealth?.broken_routes,
    all_routes_ok: appHealth?.all_routes_ok,
    sentry_issues: appHealth?.sentry_issues,
    sentry_note: appHealth?.sentry_note,
  }
}

export function buildTroubleshootAddendum(ctx: TroubleshootContext): string {
  const devices = ctx.hardware_devices.length > 0
    ? ctx.hardware_devices.map(d => '- ' + d.device_type + (d.label ? ' (' + d.label + ')' : '') + ': ' + (d.status ?? 'unknown') + ', last seen ' + (d.last_seen_at ? new Date(d.last_seen_at).toLocaleString() : 'never')).join('\n')
    : 'No devices registered'

  let addendum = '\n\n## Live Device Status\n' + devices +
    '\n\nSync errors (last 24h): ' + ctx.recent_sync_errors +
    '\nLast sale recorded: ' + (ctx.last_sale_at ? new Date(ctx.last_sale_at).toLocaleString() : 'None on record')

  // Route health section
  if (ctx.broken_routes && ctx.broken_routes.length > 0) {
    addendum += '\n\n## BROKEN ROUTES (confirmed failing right now)\n'
    addendum += ctx.broken_routes.map(r =>
      '- ' + r.name + ' (' + r.path + '): ' + r.status.toUpperCase() + (r.httpStatus ? ' HTTP ' + r.httpStatus : '') + (r.note ? ' — ' + r.note : '') + ' (' + r.ms + 'ms)',
    ).join('\n')
    addendum += '\n\nThese routes are confirmed failing. Lead with this in your diagnosis. Give specific likely causes based on the route path and your knowledge of the codebase.'
  } else if (ctx.all_routes_ok === true) {
    addendum += '\n\n## Route health: ALL 8 CRITICAL ROUTES RESPONDING NORMALLY'
  }

  // Sentry section
  if (ctx.sentry_issues && ctx.sentry_issues.length > 0) {
    addendum += '\n\n## LIVE SENTRY ERRORS (production, unresolved)\n'
    addendum += ctx.sentry_issues.map(i =>
      '- [' + i.level.toUpperCase() + '] ' + i.title +
      '\n  File: ' + i.culprit +
      '\n  Seen: ' + i.count + ' times, last ' + new Date(i.lastSeen).toLocaleString('en-AU') +
      '\n  Link: ' + i.permalink,
    ).join('\n')
    addendum += '\n\nCross-reference these errors with the user\'s reported problem. If a Sentry error matches the broken route, explain the connection specifically. Include the permalink so the user can check it.'
  }

  if (ctx.sentry_note) {
    addendum += '\n\nSentry status: ' + ctx.sentry_note
  }

  return addendum
}
