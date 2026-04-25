import { createCipheriv, createDecipheriv, randomBytes, createHmac } from 'crypto';

const getMasterKey = (): Buffer => {
  const hex = process.env.ARIA_MASTER_ENCRYPTION_KEY;
  if (!hex) throw new Error('ARIA_MASTER_ENCRYPTION_KEY not set');
  return Buffer.from(hex, 'hex');
};

export function deriveBusinessKey(businessId: string): Buffer {
  return createHmac('sha256', getMasterKey())
    .update(`aria-business-key-v1:${businessId}`)
    .digest();
}

// Returns base64-encoded iv:authTag:ciphertext
export function encryptField(plaintext: string, businessId: string): string {
  try {
    const key = deriveBusinessKey(businessId);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  } catch {
    throw new Error('Encryption failed');
  }
}

export function decryptField(encryptedValue: string, businessId: string): string {
  try {
    const key = deriveBusinessKey(businessId);
    const parts = encryptedValue.split(':');
    if (parts.length !== 3) throw new Error('Invalid format');
    const [ivHex, authTagHex, ciphertextHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const ciphertext = Buffer.from(ciphertextHex, 'hex');
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('Decryption failed');
  }
}

// Returns a hex key for client-side file encryption
export function deriveFileKey(businessId: string, fileId: string): string {
  return createHmac('sha256', deriveBusinessKey(businessId))
    .update(`aria-file-key-v1:${fileId}`)
    .digest('hex');
}

// Safely encrypt — returns null if plaintext is null/undefined
export function encryptFieldSafe(value: string | null | undefined, businessId: string): string | null {
  if (value == null || value === '') return null;
  return encryptField(value, businessId);
}

// Safely decrypt — returns null if stored value is null/undefined
export function decryptFieldSafe(value: string | null | undefined, businessId: string): string | null {
  if (value == null || value === '') return null;
  // If value doesn't look encrypted (no colons), return as-is (pre-encryption data)
  if (!value.includes(':')) return value;
  try {
    return decryptField(value, businessId);
  } catch {
    return null;
  }
}
