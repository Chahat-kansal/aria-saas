/**
 * REQUIRED ENV VARS:
 *   MYOB_CLIENT_ID     — from developer.myob.com
 *   MYOB_CLIENT_SECRET — from developer.myob.com
 *
 * REDIRECT URI to register in MYOB app:
 *   https://www.ariaos.site/api/pos/integrations?action=callback
 */

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://www.ariaos.site'
const REDIRECT_URI = `${BASE_URL}/api/pos/integrations?action=callback`

export function getMyobAuthorizeUrl(state: string): string {
  if (!process.env.MYOB_CLIENT_ID) throw new Error('MYOB_CLIENT_ID not configured')
  const params = new URLSearchParams({
    client_id: process.env.MYOB_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'CompanyFile',
    state,
  })
  return `https://secure.myob.com/oauth2/account/authorize/?${params}`
}

export async function exchangeMyobCode(code: string): Promise<{
  access_token: string; refresh_token: string; expires_in: number
}> {
  if (!process.env.MYOB_CLIENT_ID || !process.env.MYOB_CLIENT_SECRET) {
    throw new Error('MYOB OAuth credentials not configured')
  }
  const res = await fetch('https://secure.myob.com/oauth2/v1/authorize/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.MYOB_CLIENT_ID,
      client_secret: process.env.MYOB_CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
      code,
    }),
  })
  if (!res.ok) throw new Error(`MYOB token exchange failed: ${await res.text()}`)
  return res.json()
}

export async function refreshMyobToken(refresh_token: string): Promise<{
  access_token: string; refresh_token: string; expires_in: number
}> {
  if (!process.env.MYOB_CLIENT_ID || !process.env.MYOB_CLIENT_SECRET) {
    throw new Error('MYOB OAuth credentials not configured')
  }
  const res = await fetch('https://secure.myob.com/oauth2/v1/authorize/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.MYOB_CLIENT_ID,
      client_secret: process.env.MYOB_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token,
    }),
  })
  if (!res.ok) throw new Error('MYOB token refresh failed')
  return res.json()
}

export async function getMyobCompanyFiles(access_token: string): Promise<
  Array<{ Id: string; Name: string; Uri: string }>
> {
  const res = await fetch('https://api.myob.com/accountright/', {
    headers: {
      'Authorization': `Bearer ${access_token}`,
      'x-myobapi-key': process.env.MYOB_CLIENT_ID ?? '',
      'x-myobapi-version': 'v2',
    },
  })
  if (!res.ok) throw new Error('Failed to fetch MYOB company files')
  return res.json()
}
