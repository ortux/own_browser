/**
 * ConnectionManager
 * Wraps an Integration adapter with automatic reconnection using
 * exponential back-off.  Each (provider, accountId) pair gets its
 * own manager instance.
 */

import type { Integration } from './Integration';

interface BackoffOptions {
  initialMs?: number;   // default 1 000
  maxMs?:     number;   // default 60 000
  factor?:    number;   // default 2
}

export class ConnectionManager {
  private delay:   number;
  private maxDelay: number;
  private factor:  number;
  private timer:   NodeJS.Timeout | null = null;
  private stopped  = false;

  constructor(
    private readonly adapter: Integration,
    options: BackoffOptions = {}
  ) {
    this.delay    = options.initialMs ?? 1_000;
    this.maxDelay = options.maxMs     ?? 60_000;
    this.factor   = options.factor    ?? 2;

    // When the adapter signals it lost connection, schedule a reconnect.
    adapter.on('integration-error', () => {
      if (!this.stopped) this.scheduleReconnect();
    });
  }

  /** Reset delay after a successful connection. */
  onSuccess() {
    this.delay = 1_000;
    this.cancelPending();
  }

  /** Cancel any pending reconnect timer and stop managing this adapter. */
  destroy() {
    this.stopped = true;
    this.cancelPending();
  }

  private scheduleReconnect() {
    if (this.timer) return; // already scheduled
    const wait = this.delay;
    this.delay = Math.min(this.delay * this.factor, this.maxDelay);

    console.info(
      `[ConnectionManager] ${this.adapter.id} reconnecting in ${wait}ms…`
    );

    this.timer = setTimeout(async () => {
      this.timer = null;
      if (this.stopped) return;
      try {
        await this.adapter.reconnect();
        this.onSuccess();
      } catch {
        if (!this.stopped) this.scheduleReconnect();
      }
    }, wait);
  }

  private cancelPending() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
