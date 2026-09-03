/**
 * Offline Detection and Queue Service
 * Handles offline scenarios and queues operations for later sync
 */

import { log } from './logger';

export interface QueuedOperation {
  id: string;
  type: 'history' | 'bookmark' | 'settings';
  action: 'sync' | 'add' | 'remove' | 'update';
  payload: unknown;
  timestamp: number;
  retries: number;
  lastError?: string;
}

const QUEUE_STORAGE_KEY = 'zyphora_sync_queue';
const MAX_QUEUE_SIZE = 5000;
const MAX_RETRIES = 5;

class OfflineQueue {
  private queue: QueuedOperation[] = [];
  private isOnline: boolean = navigator.onLine;
  private listeners: Set<(isOnline: boolean) => void> = new Set();
  private syncInProgress: boolean = false;

  constructor() {
    this.loadQueue();
    this.setupOnlineListeners();
  }

  /**
   * Setup online/offline event listeners
   */
  private setupOnlineListeners(): void {
    window.addEventListener('online', () => {
      if (import.meta.env.DEV) log.info('[offline] Back online - starting sync');
      this.isOnline = true;
      this.notifyListeners(true);
      this.processPendingOperations();
    });

    window.addEventListener('offline', () => {
      if (import.meta.env.DEV) log.info('[offline] Offline - queueing operations');
      this.isOnline = false;
      this.notifyListeners(false);
    });
  }

  /**
   * Check if online
   */
  isConnected(): boolean {
    return this.isOnline && navigator.onLine;
  }

  /**
   * Add listener for online/offline changes
   */
  onStatusChange(callback: (isOnline: boolean) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Notify all listeners
   */
  private notifyListeners(isOnline: boolean): void {
    this.listeners.forEach((listener) => {
      try {
        listener(isOnline);
      } catch (error) {
        console.error('[offline] Listener error:', error);
      }
    });
  }

  /**
   * Add operation to queue
   */
  addOperation(
    type: QueuedOperation['type'],
    action: QueuedOperation['action'],
    payload: unknown
  ): string {
    if (this.queue.length >= MAX_QUEUE_SIZE) {
      console.warn('[offline] Queue is full, removing oldest operation');
      this.queue.shift();
    }

    const operation: QueuedOperation = {
      id: `${type}-${action}-${Date.now()}-${Math.random()}`,
      type,
      action,
      payload,
      timestamp: Date.now(),
      retries: 0,
    };

    this.queue.push(operation);
    this.saveQueue();

    if (import.meta.env.DEV) log.debug('[offline] Operation queued:', operation.id);

    // Try to process if online
    if (this.isConnected()) {
      this.processPendingOperations();
    }

    return operation.id;
  }

  /**
   * Get all pending operations
   */
  getPendingOperations(): QueuedOperation[] {
    return [...this.queue];
  }

  /**
   * Remove operation from queue
   */
  removeOperation(id: string): boolean {
    const index = this.queue.findIndex((op) => op.id === id);
    if (index > -1) {
      this.queue.splice(index, 1);
      this.saveQueue();
      return true;
    }
    return false;
  }

  /**
   * Mark operation as failed (increment retry count)
   */
  markOperationFailed(id: string, error: string): void {
    const operation = this.queue.find((op) => op.id === id);
    if (operation) {
      operation.retries++;
      operation.lastError = error;

      if (operation.retries > MAX_RETRIES) {
        console.warn(`[offline] Operation ${id} exceeded max retries, removing`);
        this.removeOperation(id);
      } else {
        this.saveQueue();
      }
    }
  }

  /**
   * Clear all queued operations
   */
  clear(): void {
    this.queue = [];
    this.saveQueue();
  }

  /**
   * Get queue stats
   */
  getStats(): {
    total: number;
    byType: Record<string, number>;
    oldest?: number;
  } {
    const byType: Record<string, number> = {};
    this.queue.forEach((op) => {
      byType[op.type] = (byType[op.type] || 0) + 1;
    });

    return {
      total: this.queue.length,
      byType,
      oldest: this.queue.length > 0 ? this.queue[0].timestamp : undefined,
    };
  }

  /**
   * Save queue to storage
   */
  private saveQueue(): void {
    try {
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(this.queue));
    } catch (error) {
      console.error('[offline] Failed to save queue:', error);
    }
  }

  /**
   * Load queue from storage
   */
  private loadQueue(): void {
    try {
      const stored = localStorage.getItem(QUEUE_STORAGE_KEY);
      if (stored) {
        this.queue = JSON.parse(stored);
        if (import.meta.env.DEV) log.debug('[offline] Loaded queue with', this.queue.length, 'operations');
      }
    } catch (error) {
      console.error('[offline] Failed to load queue:', error);
      this.queue = [];
    }
  }

  /**
   * Hand the queue to whoever registered a drain handler.
   *
   * This used to fire a `zyphora:sync-queue` CustomEvent that nothing ever
   * listened for, and it cleared `syncInProgress` synchronously without
   * waiting for any subscriber. The queue therefore grew forever and silently
   * shed its oldest entries at MAX_QUEUE_SIZE. Now a registered handler is
   * awaited, and operations it processes successfully are removed.
   */
  private async processPendingOperations(): Promise<void> {
    if (this.syncInProgress || !this.isConnected()) return;
    if (this.queue.length === 0) return;
    if (!drainHandler) {
      if (import.meta.env.DEV) log.debug('[offline] No drain handler registered; leaving queue intact');
      return;
    }

    this.syncInProgress = true;
    try {
      const operations = this.getPendingOperations();
      if (import.meta.env.DEV) log.debug('[offline] Processing', operations.length, 'pending operations');
      const processedIds = await drainHandler(operations);
      for (const id of processedIds) this.removeOperation(id);
    } catch (error) {
      console.error('[offline] Queue drain failed:', error);
    } finally {
      this.syncInProgress = false;
    }
  }

  /** Force a drain attempt (e.g. right after signing in). */
  flush(): void {
    void this.processPendingOperations();
  }
}

/**
 * Drains queued operations. Returns the ids that were handled successfully so
 * the queue can drop exactly those and retry the rest.
 */
export type QueueDrainHandler = (operations: QueuedOperation[]) => Promise<string[]>;

let drainHandler: QueueDrainHandler | null = null;

// Export singleton instance
export const offlineQueue = new OfflineQueue();

/**
 * Register the handler that actually performs queued sync work. Returns an
 * unsubscribe function. Only one handler is active at a time.
 */
export function onSyncQueue(callback: QueueDrainHandler): () => void {
  drainHandler = callback;
  // Anything queued while offline (or before sign-in) drains immediately.
  offlineQueue.flush();
  return () => {
    if (drainHandler === callback) drainHandler = null;
  };
}
