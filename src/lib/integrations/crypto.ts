/**
 * REQUIRED ENV VAR:
 *   INTEGRATION_TOKEN_KEY — 32-byte hex string (64 chars)
 *
 * Generate with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * Add to Vercel: Settings → Environment Variables
 */
import crypto from 'crypto'

const KEY_HEX = process.env.INTEGRATION_TOKEN_KEY ?? ''

function getKey(): Buffer {
  if (!KEY_HEX || KEY_HEX.length < 64) {
    throw new Error('INTEGRATION_TOKEN_KEY must be a 32-byte hex string (64 chars)')
  }
  return Buffer.from(KEY_HEX, 'hex')
}

/** Encrypts plaintext using AES-256-GCM. Returns "iv:authTag:ciphertext" hex. */
export function encrypt(plaintext: string): string {
  const key = getKey()
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString('hex'), tag.toString('hex'), encrypted.toString('hex')].join(':')
}

/** Decrypts a string produced by encrypt(). Returns null on failure. */
export function decrypt(encrypted: string): string | null {
  try {
    const key = getKey()
    const [ivHex, tagHex, dataHex] = encrypted.split(':')
    if (!ivHex || !tagHex || !dataHex) return null
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'))
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
    return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}
