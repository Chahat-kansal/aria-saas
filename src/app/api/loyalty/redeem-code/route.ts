export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getLoyaltyCustomer } from '@/lib/loyalty/auth'
import { randomBytes, createHash } from 'crypto'

// LOY-REDEEM-SCAN (customer side) — mint a SHORT-LIVED, SINGLE-USE redeem code the customer
// shows in store. The barcode/QR encodes this random token, NOT the raw customer_id (a raw id
// would be a permanent, replayable identifier). Stored HASHED with a ~3-min TTL; consumed on scan.
// Auth: getLoyaltyCustomer() only — a customer can mint a code for their OWN row.

const TTL_SECONDS = 180 // ≤3 minutes

export async function POST() {
  const me = await getLoyaltyCustomer()
  if (!me) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const token = randomBytes(12).toString('base64url') // ~16 chars, ~96 bits entropy
  const hash = createHash('sha256').update(token).digest('hex')
  const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000).toISOString()

  // Overwrites any previous code (regenerate-on-demand) and clears the consumed flag.
  const { error } = await supabaseAdmin.from('pos_customer_auth').update({
    redeem_token_hash: hash,
    redeem_token_expires_at: expiresAt,
    redeem_token_consumed_at: null,
    updated_at: new Date().toISOString(),
  }).eq('customer_id', me.customer_id).eq('business_id', me.business_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // The raw token is returned to the owner of this session only; the hash is what's stored.
  return NextResponse.json({ token, expires_at: expiresAt, ttl_seconds: TTL_SECONDS })
}
