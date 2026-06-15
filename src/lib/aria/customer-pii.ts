import { encryptFieldSafe, decryptFieldSafe } from '@/lib/encryption'

// SEC-4 — pos_customers PII encryption helpers (app-layer AES-256-GCM, per-business key).
// Foundation for staged migration: writes dual-write *_enc alongside retained plaintext;
// reads can decrypt via decryptCustomerPII (prefers ciphertext, falls back to plaintext).
// NOT zero-knowledge — Aria still reads decrypted customer data to function.

const PII_FIELDS = ['email', 'phone', 'name', 'notes'] as const
type PiiField = (typeof PII_FIELDS)[number]

export type CustomerPiiEnc = {
  email_enc: string | null
  phone_enc: string | null
  name_enc: string | null
  notes_enc: string | null
}

export type CustomerPiiPlain = {
  email: string | null
  phone: string | null
  name: string | null
  notes: string | null
}

/**
 * Build the *_enc columns for a pos_customers insert/update. NEVER throws — if the
 * master key is missing or a value can't be encrypted, that field's ciphertext is
 * null and the caller's (plaintext) write proceeds unaffected. Spread the result into
 * the insert/update payload to dual-write.
 *
 * Only emits *_enc for PII fields that are PRESENT on `src` — so a partial update
 * (e.g. `update(body)`) never clobbers ciphertext for fields it didn't touch. For a
 * full insert, pass all four fields (null is fine) to encrypt every one.
 */
export function encryptCustomerPII(
  src: Partial<Record<PiiField, string | null | undefined>>,
  businessId: string,
): Partial<CustomerPiiEnc> {
  const out: Partial<CustomerPiiEnc> = {}
  for (const f of PII_FIELDS) {
    if (!(f in src)) continue
    try {
      out[`${f}_enc` as keyof CustomerPiiEnc] = encryptFieldSafe(src[f] ?? null, businessId)
    } catch {
      out[`${f}_enc` as keyof CustomerPiiEnc] = null
    }
  }
  return out
}

/**
 * Decrypt a customer row's PII. Prefers the encrypted column; falls back to retained
 * plaintext when ciphertext is absent or fails to decrypt (migration-safe). NEVER throws.
 */
export function decryptCustomerPII(
  row: Record<string, unknown>,
  businessId: string,
): CustomerPiiPlain {
  const out: CustomerPiiPlain = { email: null, phone: null, name: null, notes: null }
  for (const f of PII_FIELDS) {
    const enc = row[`${f}_enc`] as string | null | undefined
    let val: string | null = null
    if (enc) {
      try { val = decryptFieldSafe(enc, businessId) } catch { val = null }
    }
    out[f] = val ?? ((row[f] as string | null | undefined) ?? null)
  }
  return out
}
