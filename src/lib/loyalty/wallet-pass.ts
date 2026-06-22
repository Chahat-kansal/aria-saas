import { createSign } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getTierConfig, tierForBalance } from '@/lib/loyalty/tiers'
import { getPreloadState, readPreloadConfig } from '@/lib/loyalty/preload'

// LOY-WALLET-PASS — Apple/Google Wallet pass for a membership. The pass barcode is the STABLE membership
// identity (loyalty_identity.id), so a static pass keeps working (unlike the in-app short-lived QR). All
// pass fields come from REAL data (tier from points_balance, points, preload balance). Signing secrets are
// read from env and NEVER hardcoded — when absent the endpoint reports "not configured" (founder TODO).

export interface PassData {
  identity_id: string
  business_id: string
  business_name: string
  member_name: string | null
  barcode: string            // stable membership barcode = identity id
  points: number
  dollar_value: number
  tier: string | null
  preload_balance: number | null
}

export async function buildPassData(identityId: string, businessId: string, customerId: string, memberName: string | null): Promise<PassData> {
  const { data: biz } = await supabaseAdmin.from('businesses').select('name').eq('id', businessId).maybeSingle()
  const { data: cust } = await supabaseAdmin.from('pos_customers').select('points_balance').eq('id', customerId).maybeSingle()
  const { data: cfg } = await supabaseAdmin.from('pos_loyalty_config').select('point_value_cents').eq('business_id', businessId).maybeSingle()

  const points = Number(cust?.points_balance ?? 0)
  const centsPer = Number(cfg?.point_value_cents ?? 1)
  const tierCfg = await getTierConfig(businessId)
  const tier = tierForBalance(points, tierCfg)

  let preloadBalance: number | null = null
  const pre = await readPreloadConfig(businessId)
  if (pre.enabled) preloadBalance = (await getPreloadState(businessId, customerId)).balance

  return {
    identity_id: identityId, business_id: businessId, business_name: (biz?.name as string) ?? 'Rewards',
    member_name: memberName, barcode: identityId, points, dollar_value: Math.round(points * centsPer) / 100,
    tier, preload_balance: preloadBalance,
  }
}

// ── Google Wallet — a "Save to Google Wallet" link is an RS256-signed JWT. Built with Node crypto (no
// extra deps). Requires the issuer id + a service-account private key + a pre-created loyalty class. ──
export function googleConfigured(): boolean {
  return !!(process.env.GOOGLE_WALLET_ISSUER_ID && process.env.GOOGLE_WALLET_SA_EMAIL && process.env.GOOGLE_WALLET_SA_KEY && process.env.GOOGLE_WALLET_CLASS_ID)
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function googleWalletSaveUrl(p: PassData): string | null {
  if (!googleConfigured()) return null
  const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID!
  const classId = process.env.GOOGLE_WALLET_CLASS_ID!
  const saEmail = process.env.GOOGLE_WALLET_SA_EMAIL!
  const key = (process.env.GOOGLE_WALLET_SA_KEY!).replace(/\\n/g, '\n')

  const objectId = `${issuerId}.${p.identity_id.replace(/[^\w.-]/g, '')}`
  const loyaltyObject: Record<string, unknown> = {
    id: objectId, classId, state: 'ACTIVE',
    accountId: p.identity_id, accountName: p.member_name ?? 'Member',
    loyaltyPoints: { label: 'Points', balance: { string: String(p.points) } },
    barcode: { type: 'QR_CODE', value: p.barcode, alternateText: p.barcode.slice(0, 8) },
    textModulesData: [
      ...(p.tier ? [{ id: 'tier', header: 'Tier', body: p.tier }] : []),
      ...(p.preload_balance != null ? [{ id: 'balance', header: 'Balance', body: `$${p.preload_balance.toFixed(2)}` }] : []),
    ],
  }
  const claims = {
    iss: saEmail, aud: 'google', typ: 'savetowallet', iat: Math.floor(Date.now() / 1000),
    payload: { loyaltyObjects: [loyaltyObject] },
  }
  const header = { alg: 'RS256', typ: 'JWT' }
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`
  const signature = createSign('RSA-SHA256').update(signingInput).sign(key)
  const jwt = `${signingInput}.${b64url(signature)}`
  return `https://pay.google.com/gp/v/save/${jwt}`
}

// ── Apple Wallet — a .pkpass is a signed zip (PKCS#7 detached signature of the manifest). Building the
// signature requires the Apple Pass Type ID certificate + key + WWDR cert. We assemble the pass.json
// payload here; the signed bytes are produced only when those certs are configured. ──
export function appleConfigured(): boolean {
  return !!(process.env.APPLE_PASS_TYPE_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_PASS_CERT && process.env.APPLE_PASS_KEY && process.env.APPLE_WWDR_CERT)
}

export function buildApplePassJson(p: PassData): Record<string, unknown> {
  return {
    formatVersion: 1,
    passTypeIdentifier: process.env.APPLE_PASS_TYPE_ID ?? 'pass.com.aria.loyalty',
    teamIdentifier: process.env.APPLE_TEAM_ID ?? '',
    organizationName: p.business_name,
    description: `${p.business_name} Rewards`,
    serialNumber: p.identity_id,
    backgroundColor: 'rgb(250,250,250)', foregroundColor: 'rgb(10,10,10)', labelColor: 'rgb(136,136,136)',
    barcodes: [{ format: 'PKBARCODE_FORMAT_QR', message: p.barcode, messageEncoding: 'iso-8859-1', altText: p.barcode.slice(0, 8) }],
    storeCard: {
      primaryFields: [{ key: 'points', label: 'POINTS', value: p.points }],
      secondaryFields: [
        ...(p.tier ? [{ key: 'tier', label: 'TIER', value: p.tier }] : []),
        ...(p.preload_balance != null ? [{ key: 'balance', label: 'BALANCE', value: `$${p.preload_balance.toFixed(2)}` }] : []),
      ],
      auxiliaryFields: [{ key: 'member', label: 'MEMBER', value: p.member_name ?? 'Member' }],
    },
  }
}
