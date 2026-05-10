/**
 * REQUIRED ENV VARS (add to Vercel dashboard):
 *   XERO_CLIENT_ID     — from developer.xero.com
 *   XERO_CLIENT_SECRET — from developer.xero.com
 *
 * REDIRECT URI to register in Xero app:
 *   https://www.ariaos.site/api/pos/integrations?action=callback
 *
 * Without these, the Connect button shows a clear error message
 * instead of silently failing.
 */

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://www.ariaos.site'
const REDIRECT_URI = `${BASE_URL}/api/pos/integrations?action=callback`

export function getXeroAuthorizeUrl(state: string): string {
  if (!process.env.XERO_CLIENT_ID) throw new Error('XERO_CLIENT_ID not configured')
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.XERO_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: 'accounting.transactions accounting.contacts offline_access',
    state,
  })
  return `https://login.xero.com/identity/connect/authorize?${params}`
}

export async function exchangeXeroCode(code: string): Promise<{
  access_token: string; refresh_token: string; expires_in: number
}> {
  if (!process.env.XERO_CLIENT_ID || !process.env.XERO_CLIENT_SECRET) {
    throw new Error('Xero OAuth credentials not configured')
  }
  const credentials = Buffer.from(`${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`).toString('base64')
  const res = await fetch('https://identity.xero.com/connect/token', {
    method: 'POST',
    headers: { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI }),
  })
  if (!res.ok) throw new Error(`Xero token exchange failed: ${await res.text()}`)
  return res.json()
}

export async function refreshXeroToken(refresh_token: string): Promise<{
  access_token: string; refresh_token: string; expires_in: number
}> {
  if (!process.env.XERO_CLIENT_ID || !process.env.XERO_CLIENT_SECRET) {
    throw new Error('Xero OAuth credentials not configured')
  }
  const credentials = Buffer.from(`${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`).toString('base64')
  const res = await fetch('https://identity.xero.com/connect/token', {
    method: 'POST',
    headers: { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token }),
  })
  if (!res.ok) throw new Error('Xero token refresh failed')
  return res.json()
}

export async function getXeroTenants(access_token: string): Promise<
  Array<{ tenantId: string; tenantName: string; tenantType: string }>
> {
  const res = await fetch('https://api.xero.com/connections', {
    headers: { 'Authorization': `Bearer ${access_token}` },
  })
  if (!res.ok) throw new Error('Failed to fetch Xero tenants')
  return res.json()
}
