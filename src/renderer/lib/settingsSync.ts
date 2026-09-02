/**
 * Settings Sync Service
 * Manages user settings synchronization across devices
 */

import { apiClient } from './apiClient';

export interface UserSettings {
  [key: string]: unknown;
}

export interface SettingsSyncResponse {
  ok: boolean;
  settings: UserSettings;
  updated_at?: string;
}

/**
 * Save settings to backend
 */
export async function saveSettingsToBackend(settings: UserSettings): Promise<boolean> {
  try {
    console.debug('[settings-sync] Saving to backend:', Object.keys(settings));

    const response = await apiClient.put(
      '/api/v1/sync/settings',
      { settings },
      { requireAuth: true }
    );

    if (response.ok) {
      console.debug('[settings-sync] Settings saved successfully');
      return true;
    }

    throw new Error(response.error || 'Settings save failed');
  } catch (error) {
    console.error('[settings-sync] Error saving settings:', error);
    return false;
  }
}

/**
 * Load settings from backend
 */
export async function loadSettingsFromBackend(): Promise<UserSettings | null> {
  try {
    console.debug('[settings-sync] Loading from backend');

    const response = await apiClient.get('/api/v1/sync/settings', { requireAuth: true });

    if (response.ok && response.data) {
      const data = response.data as SettingsSyncResponse;
      console.debug('[settings-sync] Settings loaded:', Object.keys(data.settings || {}));
      return data.settings || {};
    }

    return null;
  } catch (error) {
    console.error('[settings-sync] Error loading settings:', error);
    return null;
  }
}

/**
 * Merge local settings with remote settings
 * Local settings take precedence for recent changes
 */
export function mergeSettings(
  localSettings: UserSettings,
  remoteSettings: UserSettings,
  localTimestamp?: number
): UserSettings {
  // If no local timestamp or settings are very old, use remote
  if (!localTimestamp) {
    return { ...remoteSettings, ...localSettings };
  }

  const now = Date.now();
  const isLocalRecent = now - localTimestamp < 60 * 1000; // < 1 minute

  if (isLocalRecent) {
    // Local settings are recent, use them
    return { ...remoteSettings, ...localSettings };
  }

  // Remote settings are more recent
  return { ...localSettings, ...remoteSettings };
}

/**
 * Settings keys that should NOT be synced (device-specific)
 */
const NO_SYNC_KEYS = new Set(['downloadPath', 'openDownloadsOnStart', 'proxy', 'proxyEnabled']);

/**
 * Filter settings for sync (remove device-specific ones)
 */
export function filterSettingsForSync(settings: UserSettings): UserSettings {
  const filtered: UserSettings = {};

  for (const [key, value] of Object.entries(settings)) {
    if (!NO_SYNC_KEYS.has(key)) {
      filtered[key] = value;
    }
  }

  return filtered;
}

/**
 * Validate settings before saving
 */
export function validateSettings(settings: UserSettings): {
  valid: boolean;
  error?: string;
  settings?: UserSettings;
} {
  const maxSize = 1024 * 1024; // 1MB
  const serialized = JSON.stringify(settings);

  if (serialized.length > maxSize) {
    return {
      valid: false,
      error: `Settings size exceeds maximum (${serialized.length} > ${maxSize})`,
    };
  }

  return {
    valid: true,
    settings,
  };
}
