/**
 * EngineStartup
 * Wires the Application Engine into the Electron app lifecycle:
 *   - starts the engine when the app is ready
 *   - restores previously-connected accounts from SQLite
 *   - handles powerMonitor suspend/resume (laptop sleep)
 *   - flushes state on will-quit
 */

import { powerMonitor } from 'electron';
import { applicationEngine } from './ApplicationEngine';
import { notificationManager } from './NotificationManager';
import { networkManager } from './NetworkManager';
import { getEngineAccounts, saveIntegrationState } from '../db';
import type { IntegrationAccount } from './Integration';

/** Call once inside app.on('ready') after initDb() resolves. */
export async function startEngine(): Promise<void> {
  console.info('[EngineStartup] Starting engine subsystems…');

  // 1. Start notification pipeline
  notificationManager.start();

  // 2. Start network watcher
  networkManager.start();

  // 3. Start the application engine (registers event processor)
  await applicationEngine.start();

  // 4. Restore previously connected accounts
  await restoreAccounts();

  // 5. Handle laptop sleep / resume
  powerMonitor.on('suspend', onSuspend);
  powerMonitor.on('resume',  onResume);

  // 6. Persist integration states periodically
  setInterval(persistStates, 60_000);

  console.info('[EngineStartup] Engine ready.');
}

/** Call inside app.on('will-quit'). */
export async function stopEngine(): Promise<void> {
  console.info('[EngineStartup] Stopping engine…');
  powerMonitor.off('suspend', onSuspend);
  powerMonitor.off('resume',  onResume);
  persistStates();
  notificationManager.stop();
  networkManager.stop();
  await applicationEngine.stop();
  console.info('[EngineStartup] Engine stopped.');
}

// ── Restore ───────────────────────────────────────────────────────────────────

async function restoreAccounts(): Promise<void> {
  const accounts = getEngineAccounts();
  if (!accounts.length) {
    console.info('[EngineStartup] No saved accounts to restore.');
    return;
  }
  console.info(`[EngineStartup] Restoring ${accounts.length} account(s)…`);

  for (const row of accounts) {
    const account: IntegrationAccount = {
      id:          row.id,
      provider:    row.provider,
      displayName: row.display_name,
      email:       row.email ?? undefined,
    };
    void applicationEngine.connect(account).catch((err: unknown) => {
      console.warn(`[EngineStartup] Could not restore ${row.provider}:${row.id}:`, err);
    });
  }
}

// ── Power events ──────────────────────────────────────────────────────────────

function onSuspend() {
  console.info('[EngineStartup] System suspending — pausing integrations.');
  networkManager.markOffline();
}

async function onResume() {
  console.info('[EngineStartup] System resumed — reconnecting integrations.');
  // Small delay: give the OS time to re-establish network
  await new Promise<void>((resolve) => setTimeout(resolve, 3_000));
  networkManager.recheckOnline();
  await applicationEngine.reconnectAll();
}

// ── State persistence ─────────────────────────────────────────────────────────

function persistStates() {
  const statuses = applicationEngine.getAllStatuses();
  for (const s of statuses) {
    saveIntegrationState({
      provider:      s.provider,
      account_id:    s.accountId,
      status:        s.status,
      connected_at:  s.connectedAt,
      last_event_at: s.lastEventAt,
      last_error:    s.lastError ? JSON.stringify(s.lastError) : null,
    });
  }
}
