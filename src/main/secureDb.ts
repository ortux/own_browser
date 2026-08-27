/**
 * secureDb.ts — AES-256-GCM file encryption for local databases.
 *
 * File format (binary):
 *   bytes 0..3   magic  "ZYP1"
 *   byte  4      format version (1)
 *   bytes 5..16  12-byte random IV
 *   bytes 17..32 16-byte GCM auth tag
 *   bytes 33..   ciphertext
 *
 * The key itself is managed by the caller (see secureDbKey.ts) and never
 * touches disk in plaintext. GCM's auth tag makes tampering detectable.
 */
import crypto from 'node:crypto';

const MAGIC = Buffer.from('ZYP1', 'utf-8');
const VERSION = 1;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const HEADER_LENGTH = MAGIC.length + 1 + IV_LENGTH + TAG_LENGTH;

export function isEncryptedFile(data: Buffer): boolean {
  return data.length > HEADER_LENGTH && data.subarray(0, MAGIC.length).equals(MAGIC);
}

/** Encrypt a plaintext buffer under a 32-byte key. */
export function encryptBuffer(key: Buffer, plaintext: Buffer): Buffer {
  if (key.length !== 32) throw new Error('secureDb: key must be 32 bytes (AES-256).');
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([MAGIC, Buffer.from([VERSION]), iv, tag, ciphertext]);
}

/**
 * Decrypt a file produced by encryptBuffer. Throws if the payload is not in
 * our format, the version is unknown, or the auth tag does not verify.
 */
export function decryptBuffer(key: Buffer, file: Buffer): Buffer {
  if (key.length !== 32) throw new Error('secureDb: key must be 32 bytes (AES-256).');
  if (!isEncryptedFile(file)) throw new Error('secureDb: not an encrypted database file.');
  const version = file[MAGIC.length];
  if (version !== VERSION) throw new Error(`secureDb: unsupported format version ${version}.`);
  const iv = file.subarray(MAGIC.length + 1, MAGIC.length + 1 + IV_LENGTH);
  const tag = file.subarray(MAGIC.length + 1 + IV_LENGTH, HEADER_LENGTH);
  const ciphertext = file.subarray(HEADER_LENGTH);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
