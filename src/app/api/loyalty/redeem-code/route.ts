export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getLoyaltyIdentity } from '@/lib/loyalty/auth'
import { randomBytes, createHash } from 'crypto'

// LOY-NETWORK — mint a SHORT-LIVED, SINGLE-USE redeem code on the global IDENTITY (one barcode that
// works at any Aria business). The barcode encodes a random token, NOT a customer/identity id. Stored
// hashed (sha256) with a ~3-min TTL; consumed at scan. At scan, the cashier's business decides which
// membership is redeemed. Auth: getLoyaltyIdentity() only — a customer mints their own code.

const TTL_SECONDS = 180 // ≤3 minutes

export async function POST() {
  const identity = await getLoyaltyIdentity()
  if (!identity) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const token = randomBytes(12).toString('base64url') // ~16 chars, ~96 bits entropy
  const hash = createHash('sha256').update(token).digest('hex')
  const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000).toISOString()

  const { error } = await supabaseAdmin.from('loyalty_identity').update({
    redeem_token_hash: hash,
    redeem_token_expires_at: expiresAt,
    redeem_token_consumed_at: null,
    updated_at: new Date().toISOString(),
  }).eq('id', identity.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ token, expires_at: expiresAt, ttl_seconds: TTL_SECONDS })
}
