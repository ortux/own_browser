/**
 * secureDbKey.ts — OS-keychain-backed database encryption key.
 *
 * A random 32-byte AES key is generated once and stored wrapped by
 * Electron's safeStorage (OS keychain: libsecret / Keychain / DPAPI). The
 * plaintext key only ever exists in memory. If safeStorage is unavailable
 * (some Linux headless setups), we return null and the database stays in
 * the legacy plaintext format rather than blocking browsing.
 */
import { app, safeStorage } from 'electron';
import fs from 'fs';
import path from 'path';
import crypto from 'node:crypto';

const KEY_FILENAME = 'db.key';

function keyPath(): string {
  return path.join(app.getPath('userData'), KEY_FILENAME);
}

/** Returns the 32-byte key, or null when OS-level storage is unavailable. */
export function getOrCreateDbKey(): Buffer | null {
  try {
    if (!safeStorage.isEncryptionAvailable()) return null;

    const file = keyPath();
    if (fs.existsSync(file)) {
      const wrapped = fs.readFileSync(file);
      const base64 = safeStorage.decryptString(wrapped);
      const key = Buffer.from(base64, 'base64');
      if (key.length === 32) return key;
      console.warn('[db-key] stored key is unusable; generating a fresh one.');
    }

    const key = crypto.randomBytes(32);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temp = `${file}.tmp-${process.pid}`;
    fs.writeFileSync(temp, safeStorage.encryptString(key.toString('base64')));
    fs.renameSync(temp, file);
    return key;
  } catch (error) {
    console.warn('[db-key] key management unavailable; database stays plaintext:', error);
    return null;
  }
}
