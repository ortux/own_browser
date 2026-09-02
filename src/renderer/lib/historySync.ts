import { useSettingsStore } from '../stores/settingsStore';
import { createAuthApiClient } from './authApi';

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
    const tokens = localStorage.getItem('zyphora_tokens');
    
    if (!tokens || !deviceKey) {
      console.debug('[sync] Skipping history sync: no auth tokens or device key');
      return;
    }

    const { access_token } = JSON.parse(tokens);
    if (!access_token) return;

    // Get local history
    const historyList = await window.browserAPI.history.get();
    if (!historyList || historyList.length === 0) {
      console.debug('[sync] No history to sync');
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
      const result = await authApi.syncHistory(
        { device_key: deviceKey, events },
        access_token
      );
      console.debug('[sync] History synced:', result);
      return result;
    }

    // Sequential sync with retries
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const result = await authApi.syncHistory(
          { device_key: deviceKey, events },
          access_token
        );
        console.debug('[sync] History synced successfully on attempt', attempt + 1);
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.warn(`[sync] Attempt ${attempt + 1} failed:`, lastError.message);
        
        if (attempt < maxRetries - 1) {
          // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
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
  // Sync on focus
  window.addEventListener('focus', async () => {
    try {
      await syncHistoryWithDevice({ batch: true });
    } catch (error) {
      console.debug('[sync] Focus sync failed (non-critical):', error);
    }
  });

  // Periodic sync
  const intervalId = setInterval(async () => {
    try {
      await syncHistoryWithDevice({ batch: true });
    } catch (error) {
      console.debug('[sync] Periodic sync failed (non-critical):', error);
    }
  }, intervalMs);

  // Cleanup function
  return () => clearInterval(intervalId);
}
