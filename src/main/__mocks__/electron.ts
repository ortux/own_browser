/**
 * Minimal Electron stand-in for `npm run test:passwords`.
 * Aliased in place of the real `electron` module by esbuild, so the database
 * layer can be exercised in plain Node. The "encryption" is a reversible XOR:
 * it only needs to prove that values are transformed on the way in and
 * restored on the way out, not to provide real secrecy.
 */
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zyphora-test-'));

export const app = {
  getPath: (): string => userDataDir,
};

const XOR_KEY = 0x5a;

export const safeStorage = {
  isEncryptionAvailable: (): boolean => true,
  encryptString: (plain: string): Buffer =>
    Buffer.from([...Buffer.from(plain, 'utf8')].map((byte) => byte ^ XOR_KEY)),
  decryptString: (encrypted: Buffer): string =>
    Buffer.from([...encrypted].map((byte) => byte ^ XOR_KEY)).toString('utf8'),
};
