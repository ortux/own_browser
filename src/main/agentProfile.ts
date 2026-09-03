/**
 * agentProfile.ts — the details the agent is allowed to fill into forms.
 *
 * Two separate concerns:
 *   - the Gemini API key, which is a credential and is always encrypted;
 *   - profile fields (name, email, address...), where the user marks which are
 *     sensitive. Sensitive values are encrypted at rest and are never sent to
 *     the model — the model receives a placeholder and asks to type into a
 *     field by reference, and main substitutes the real value locally.
 *
 * That last point is the reason this module exists separately: a national ID
 * or card number should be typeable into a form without ever being uploaded to
 * a model provider.
 */

import { safeStorage } from 'electron';
import type { AgentProfileField } from '../shared/agent';
import { readJsonFile, writeJsonFile, isRecord } from './jsonStore';

const FILENAME = 'agent-profile.json';
const ENCRYPTED_PREFIX = 'enc:v1:';

export class AgentSecretUnavailableError extends Error {
  constructor() {
    super('OS keychain unavailable; refusing to store agent secrets in plaintext.');
    this.name = 'AgentSecretUnavailableError';
  }
}

function encrypt(plain: string): string {
  let available = false;
  try {
    available = safeStorage.isEncryptionAvailable();
  } catch (error) {
    console.error('[agent] could not query OS keychain availability:', error);
  }
  // Same policy as saved passwords: never silently downgrade to plaintext.
  if (!available) throw new AgentSecretUnavailableError();
  try {
    return ENCRYPTED_PREFIX + safeStorage.encryptString(plain).toString('base64');
  } catch (error) {
    console.error('[agent] secret encryption failed:', error);
    throw new AgentSecretUnavailableError();
  }
}

function decrypt(stored: string): string {
  if (!stored.startsWith(ENCRYPTED_PREFIX)) return stored;
  try {
    return safeStorage.decryptString(Buffer.from(stored.slice(ENCRYPTED_PREFIX.length), 'base64'));
  } catch (error) {
    console.error('[agent] could not decrypt stored secret:', error);
    return '';
  }
}

interface StoredProfile {
  apiKey?: string;
  fields?: Array<{ key: string; label: string; value: string; secret?: boolean }>;
}

function read(): StoredProfile {
  const parsed = readJsonFile(FILENAME);
  return isRecord(parsed) ? (parsed as StoredProfile) : {};
}

function write(profile: StoredProfile): void {
  writeJsonFile(FILENAME, profile);
}

/** Store the Gemini API key, encrypted. */
export function setApiKey(key: string): void {
  const profile = read();
  profile.apiKey = key ? encrypt(key) : undefined;
  write(profile);
}

/** The decrypted API key, for use by the main-process Gemini client only. */
export function getApiKey(): string {
  const stored = read().apiKey;
  return stored ? decrypt(stored) : '';
}

export function hasApiKey(): boolean {
  return Boolean(read().apiKey);
}

/**
 * Profile fields for the settings UI.
 *
 * Secret values are returned masked — the renderer never needs the plaintext,
 * and not sending it means it cannot leak into a devtools inspection or a
 * React state dump.
 */
export function getProfileForDisplay(): AgentProfileField[] {
  return (read().fields ?? []).map((field) => ({
    key: field.key,
    label: field.label,
    value: field.secret ? (field.value ? '••••••••' : '') : decrypt(field.value),
    secret: field.secret,
  }));
}

/** Replace the whole field list. */
export function setProfile(fields: AgentProfileField[]): void {
  const profile = read();
  const existing = new Map((profile.fields ?? []).map((f) => [f.key, f]));

  profile.fields = fields.map((field) => {
    const previous = existing.get(field.key);
    // A masked value coming back from the UI means "unchanged" — keep the
    // stored ciphertext rather than overwriting it with the mask characters.
    if (field.secret && field.value === '••••••••' && previous) {
      return { ...previous, label: field.label, secret: true };
    }
    return {
      key: field.key,
      label: field.label,
      secret: field.secret,
      value: field.secret ? encrypt(field.value) : field.value,
    };
  });

  write(profile);
}

/**
 * The profile as the model may see it.
 *
 * Secret fields are replaced with a placeholder so the model can still reason
 * about ("there is a card number available") and reference them, without the
 * value ever leaving the machine.
 */
export function getProfileForModel(): Array<{ key: string; label: string; value: string }> {
  return (read().fields ?? []).map((field) => ({
    key: field.key,
    label: field.label,
    value: field.secret ? `<secret:${field.key}>` : field.value,
  }));
}

/** Resolve a `<secret:key>` placeholder back to its real value, locally. */
export function resolveSecretPlaceholder(text: string): string {
  const match = /^<secret:(.+)>$/.exec(text.trim());
  if (!match) return text;
  const field = (read().fields ?? []).find((f) => f.key === match[1]);
  if (!field?.secret) return text;
  return decrypt(field.value);
}

/** Wipe everything the agent knows. Used by "clear browsing data". */
export function clearAgentProfile(): void {
  write({});
}
