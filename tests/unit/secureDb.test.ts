import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { encryptBuffer, decryptBuffer, isEncryptedFile } from '../../src/main/secureDb';

const KEY = crypto.randomBytes(32);
const OTHER_KEY = crypto.randomBytes(32);
const PAYLOAD = Buffer.from('sqlite-binary-blob-contents-\u0000\u0001\u0002');

describe('secureDb', () => {
  it('round-trips a payload', () => {
    const file = encryptBuffer(KEY, PAYLOAD);
    expect(decryptBuffer(KEY, file).equals(PAYLOAD)).toBe(true);
  });

  it('produces a detectable magic header', () => {
    const file = encryptBuffer(KEY, PAYLOAD);
    expect(isEncryptedFile(file)).toBe(true);
    expect(isEncryptedFile(PAYLOAD)).toBe(false);
    expect(isEncryptedFile(Buffer.alloc(0))).toBe(false);
  });

  it('uses a fresh IV per call (ciphertexts differ)', () => {
    const a = encryptBuffer(KEY, PAYLOAD);
    const b = encryptBuffer(KEY, PAYLOAD);
    expect(a.equals(b)).toBe(false);
    expect(decryptBuffer(KEY, a).equals(PAYLOAD)).toBe(true);
    expect(decryptBuffer(KEY, b).equals(PAYLOAD)).toBe(true);
  });

  it('rejects the wrong key (auth tag mismatch)', () => {
    const file = encryptBuffer(KEY, PAYLOAD);
    expect(() => decryptBuffer(OTHER_KEY, file)).toThrow();
  });

  it('detects tampering with the ciphertext', () => {
    const file = encryptBuffer(KEY, PAYLOAD);
    file[file.length - 1] ^= 0xff;
    expect(() => decryptBuffer(KEY, file)).toThrow();
  });

  it('detects tampering with the header/auth tag', () => {
    const file = encryptBuffer(KEY, PAYLOAD);
    file[20] ^= 0xff; // inside the tag region
    expect(() => decryptBuffer(KEY, file)).toThrow();
  });

  it('rejects non-encrypted input and invalid key sizes', () => {
    expect(() => decryptBuffer(KEY, PAYLOAD)).toThrow(/not an encrypted database file/);
    expect(() => encryptBuffer(Buffer.alloc(16), PAYLOAD)).toThrow(/32 bytes/);
  });
});
