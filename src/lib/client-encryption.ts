'use client';

async function importKey(hexKey: string): Promise<CryptoKey> {
  const keyBuffer = new Uint8Array(hexKey.match(/.{2}/g)!.map(b => parseInt(b, 16)));
  return crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptFile(
  file: File,
  hexKey: string
): Promise<{ encryptedBlob: Blob; ivHex: string; originalName: string; originalType: string }> {
  const key = await importKey(hexKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const fileBuffer = await file.arrayBuffer();
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, fileBuffer);
  return {
    encryptedBlob: new Blob([encrypted], { type: 'application/octet-stream' }),
    ivHex: Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join(''),
    originalName: file.name,
    originalType: file.type,
  };
}

export async function decryptFile(
  encryptedBuffer: ArrayBuffer,
  hexKey: string,
  ivHex: string,
  originalName: string,
  originalType: string
): Promise<File> {
  const key = await importKey(hexKey);
  const iv = new Uint8Array(ivHex.match(/.{2}/g)!.map(b => parseInt(b, 16)));
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, encryptedBuffer);
  return new File([decrypted], originalName, { type: originalType });
}