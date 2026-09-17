/**
 * ApplicationEngine
 * Central controller for all integrations.
 * Coordinates lifecycle, event routing, and health monitoring.
 */

import { EventEmitter } from 'events';
import type { Integration, IntegrationAccount } from './Integration';
import { eventBus } from './EventBus';
import { eventProcessor } from './EventProcessor';
import type { IntegrationStateSnapshot } from './IntegrationState';
import type { NormalizedEvent } from './types/events';

export interface EngineHealth {
  status: 'running' | 'stopped';
  uptime: number;          // ms since start
  connectedCount: number;
  totalIntegrations: number;
  eventCount: number;
  errorCount: number;
  lastEventAt: number | null;
}

type AdapterFactory = (account: IntegrationAccount) => Integration;

export class ApplicationEngine extends EventEmitter {
  private adapters = new Map<string, Integration>(); // key: `${provider}:${accountId}`
  private registry = new Map<string, AdapterFactory>();
  private startedAt: number | null = null;
  private eventCount = 0;
  private errorCount = 0;
  private lastEventAt: number | null = null;

  // ── Registry ──────────────────────────────────────────────────────────────

  /**
   * Register an adapter factory for a provider.
   * Call this before start().
   */
  register(providerId: string, factory: AdapterFactory) {
    this.registry.set(providerId, factory);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async start() {
    this.startedAt = Date.now();
    eventProcessor.start();
    eventProcessor.onProcessed((event) => this.onProcessedEvent(event));
    console.info('[Engine] Application Engine started');
    this.emit('started');
  }

  async stop() {
    console.info('[Engine] Stopping Application Engine…');
    eventProcessor.stop();

    const disconnects = [...this.adapters.values()].map((a) =>
      a.destroy().catch((err: unknown) =>
        console.warn('[Engine] adapter destroy error:', err)
      )
    );
    await Promise.allSettled(disconnects);
    this.adapters.clear();
    this.startedAt = null;
    console.info('[Engine] Application Engine stopped');
    this.emit('stopped');
  }

  // ── Connection API ────────────────────────────────────────────────────────

  async connect(account: IntegrationAccount): Promise<void> {
    const key = this.key(account.provider, account.id);
    if (this.adapters.has(key)) {
      console.warn(`[Engine] Already connected: ${key}`);
      return;
    }

    const factory = this.registry.get(account.provider);
    if (!factory) throw new Error(`No adapter registered for provider: ${account.provider}`);

    const adapter = factory(account);

    adapter.on('event', (event: NormalizedEvent) => {
      eventBus.publish(event);
    });

    adapter.on('integration-error', (err: unknown) => {
      this.errorCount++;
      console.error(`[Engine] Integration error [${key}]:`, err);
      this.emit('integration-error', { key, error: err });
    });

    this.adapters.set(key, adapter);

    try {
      await adapter.initialize();
      await adapter.connect();
      const status = adapter.getStatus().status;
      console.info(`[Engine] ${status === 'connected' ? 'Connected' : 'Registered'}: ${key} (${status})`);
      this.emit('integration-connected', account);
    } catch (err) {
      console.error(`[Engine] Failed to connect: ${key}`, err);
      this.adapters.delete(key);
      throw err;
    }
  }

  async disconnect(provider: string, accountId: string): Promise<void> {
    const key = this.key(provider, accountId);
    const adapter = this.adapters.get(key);
    if (!adapter) return;

    await adapter.destroy().catch((err: unknown) =>
      console.warn('[Engine] disconnect error:', err)
    );
    this.adapters.delete(key);
    console.info(`[Engine] Disconnected: ${key}`);
    this.emit('integration-disconnected', { provider, accountId });
  }

  async reconnectAll(): Promise<void> {
    console.info('[Engine] Reconnecting all integrations…');
    const reconnects = [...this.adapters.values()].map((a) =>
      a.reconnect().catch((err: unknown) =>
        console.warn('[Engine] reconnect error:', err)
      )
    );
    await Promise.allSettled(reconnects);
  }

  // ── Status ────────────────────────────────────────────────────────────────

  getStatus(provider: string, accountId: string): IntegrationStateSnapshot | null {
    return this.adapters.get(this.key(provider, accountId))?.getStatus() ?? null;
  }

  getAllStatuses(): IntegrationStateSnapshot[] {
    return [...this.adapters.values()].map((a) => a.getStatus());
  }

  getHealth(): EngineHealth {
    const statuses = this.getAllStatuses();
    return {
      status: this.startedAt !== null ? 'running' : 'stopped',
      uptime: this.startedAt !== null ? Date.now() - this.startedAt : 0,
      connectedCount: statuses.filter((s) => s.status === 'connected').length,
      totalIntegrations: statuses.length,
      eventCount: this.eventCount,
      errorCount: this.errorCount,
      lastEventAt: this.lastEventAt,
    };
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private onProcessedEvent(event: NormalizedEvent) {
    this.eventCount++;
    this.lastEventAt = Date.now();
    this.emit('notification-event', event);
  }

  private key(provider: string, accountId: string) {
    return `${provider}:${accountId}`;
  }
}

// Singleton
export const applicationEngine = new ApplicationEngine();
