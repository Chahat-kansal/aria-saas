import { config } from 'dotenv'
config({ path: '.env.local', quiet: true })

async function main() {
  const { supabaseAdmin } = await import('../src/lib/supabase-admin')
  const { encryptFieldSafe } = await import('../src/lib/encryption')

  const { data: rows, error } = await supabaseAdmin
    .from('square_connections')
    .select('business_id, square_merchant_id, square_location_id, access_token, refresh_token, token_expires_at, scope, sync_status, sync_error, last_synced_at')
  if (error) { console.error('fetch failed:', error.message); process.exit(1) }
  console.log('square_connections rows:', rows?.length ?? 0)

  let migrated = 0
  for (const r of rows ?? []) {
    const bid = r.business_id as string
    if (!bid) continue
    const payload = {
      business_id: bid,
      integration_key: 'square',
      status: (r.sync_status as string | null) ?? 'connected',
      access_token_encrypted: encryptFieldSafe((r.access_token as string | null) ?? null, bid),
      refresh_token_encrypted: encryptFieldSafe((r.refresh_token as string | null) ?? null, bid),
      token_expires_at: (r.token_expires_at as string | null) ?? null,
      scopes: typeof r.scope === 'string' && r.scope ? (r.scope as string).split(/[ ,]+/).filter(Boolean) : null,
      external_account_id: (r.square_merchant_id as string | null) ?? null,
      config: r.square_location_id ? { location_id: r.square_location_id } : null,
      last_error: (r.sync_error as string | null) ?? null,
      last_sync_at: (r.last_synced_at as string | null) ?? null,
      auth_state_token: null,
      updated_at: new Date().toISOString(),
    }
    const { error: upErr } = await supabaseAdmin
      .from('pos_oauth_integrations')
      .upsert(payload, { onConflict: 'business_id,integration_key' })
    if (upErr) { console.error('upsert failed', bid, upErr.message) } else { migrated++ }
  }
  console.log(JSON.stringify({ migrated }))
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
