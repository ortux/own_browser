import { useSettingsStore } from '../stores/settingsStore';
import { createAuthApiClient } from './authApi';
import { ensureValidToken } from './tokenManager';
import { log } from './logger';

export interface SyncHistoryOptions {
  batch?: boolean;
  maxRetries?: number;
}

/**
 * Syncs local history events to the backend using the device_key
 */
export async function syncHistoryWithDevice(options: SyncHistoryOptions = {}) {
  const { batch = true, maxRetries = 3 } = options;

  try {
    const store = useSettingsStore.getState();
    const { deviceKey } = store;

    if (!deviceKey) {
      if (import.meta.env.DEV) log.debug('[sync] Skipping history sync: no device key');
      return;
    }

    // Read through the token manager rather than localStorage directly: it
    // owns the storage key and transparently refreshes an expired token.
    const access_token = await ensureValidToken();
    if (!access_token) {
      if (import.meta.env.DEV) log.debug('[sync] Skipping history sync: no valid access token');
      return;
    }

    // Get local history
    // Ask for the full retained window; the default (200) silently truncated
    // every sync, so older entries never reached the backend.
    const historyList = await window.browserAPI.history.get(500);
    if (!historyList || historyList.length === 0) {
      if (import.meta.env.DEV) log.debug('[sync] No history to sync');
      return;
    }

    // Create auth API client
    const authApi = createAuthApiClient({
      baseUrl: store.authBaseUrl,
    });

    // Transform history entries to sync format
    const events = historyList.map((entry) => ({
      client_event_id: `${entry.id}`,
      url: entry.url,
      title: entry.title || '',
      visited_at: new Date(entry.visited_at || Date.now()).toISOString(),
    }));

    if (batch) {
      // Send all events in one request
      const result = await authApi.syncHistory({ device_key: deviceKey, events }, access_token);
      if (import.meta.env.DEV) log.debug('[sync] History synced:', result);
      return result;
    }

    // Sequential sync with retries
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const result = await authApi.syncHistory({ device_key: deviceKey, events }, access_token);
        if (import.meta.env.DEV) log.debug('[sync] History synced successfully on attempt', attempt + 1);
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.warn(`[sync] Attempt ${attempt + 1} failed:`, lastError.message);

        if (attempt < maxRetries - 1) {
          // Exponential backoff
          await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }

    throw lastError || new Error('History sync failed after retries');
  } catch (error) {
    console.error('[sync] Failed to sync history:', error);
    throw error;
  }
}

/**
 * Sets up automatic history syncing
 * Syncs every N minutes or when window regains focus
 */
export function initHistorySync(intervalMs: number = 5 * 60 * 1000) {
  const run = async (reason: string) => {
    try {
      await syncHistoryWithDevice({ batch: true });
    } catch (error) {
      if (import.meta.env.DEV) log.debug(`[sync] ${reason} sync failed (non-critical):`, error);
    }
  };

  // Sync on focus. Kept as a named handler so the cleanup below can actually
  // remove it — an anonymous listener here leaked one handler per sign-in.
  const onFocus = () => void run('Focus');
  window.addEventListener('focus', onFocus);

  const intervalId = setInterval(() => void run('Periodic'), intervalMs);

  return () => {
    window.removeEventListener('focus', onFocus);
    clearInterval(intervalId);
  };
}
