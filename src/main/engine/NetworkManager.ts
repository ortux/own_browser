/**
 * NetworkManager
 * Monitors network reachability and notifies the ApplicationEngine
 * when connectivity changes so integrations can pause/resume.
 */

import * as dns from 'dns';
import { applicationEngine } from './ApplicationEngine';

const CHECK_INTERVAL_MS = 15_000;
const CHECK_HOST        = 'dns.google';  // lightweight reachability probe

export class NetworkManager {
  private online  = true;
  private timer:  NodeJS.Timeout | null = null;
  private started = false;

  start() {
    if (this.started) return;
    this.started = true;
    this.check();
    this.timer = setInterval(() => this.check(), CHECK_INTERVAL_MS);
  }

  stop() {
    this.started = false;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  /** Force offline (called on powerMonitor.suspend). */
  markOffline() {
    if (this.online) {
      this.online = false;
      console.info('[NetworkManager] Marked offline (suspend).');
    }
  }

  /** Trigger an immediate reachability check (called on powerMonitor.resume). */
  recheckOnline() {
    this.check();
  }

  get isOnline(): boolean { return this.online; }

  private check() {
    dns.resolve(CHECK_HOST, (err) => {
      const nowOnline = !err;

      if (!this.online && nowOnline) {
        this.online = true;
        console.info('[NetworkManager] Network online — reconnecting integrations.');
        applicationEngine.reconnectAll().catch((e: unknown) =>
          console.warn('[NetworkManager] reconnect error:', e)
        );
      } else if (this.online && !nowOnline) {
        this.online = false;
        console.info('[NetworkManager] Network offline — pausing reconnect loops.');
      }
    });
  }
}

// Singleton
export const networkManager = new NetworkManager();
