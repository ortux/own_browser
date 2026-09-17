/**
 * Integration — Base class / interface contract.
 * Every adapter must extend this and implement the abstract methods.
 */

import { EventEmitter } from 'events';
import type { NormalizedEvent } from './types/events';
import { IntegrationState } from './IntegrationState';
import type { IntegrationStateSnapshot } from './IntegrationState';

export interface IntegrationAccount {
  id: string;
  provider: string;
  displayName: string;
  email?: string;
  avatar?: string;
  credentials?: Record<string, unknown>; // stored securely; never logged
}

export interface IntegrationCapabilities {
  notifications: boolean;
  messaging: boolean;
  webhooks: boolean;
  realtime: boolean;
  polling: boolean;
}

export abstract class Integration extends EventEmitter {
  abstract readonly id: string;         // e.g. "gmail"
  abstract readonly name: string;       // e.g. "Gmail"
  abstract readonly version: string;
  abstract readonly capabilities: IntegrationCapabilities;

  protected state: IntegrationState;

  constructor(protected account: IntegrationAccount) {
    super();
    this.state = new IntegrationState(account.provider, account.id);
  }

  /** One-time setup — called before connect(). */
  abstract initialize(): Promise<void>;

  /** Establish the connection / start polling. */
  abstract connect(): Promise<void>;

  /** Gracefully tear down. */
  abstract disconnect(): Promise<void>;

  /** Force a clean reconnect after a failure. */
  async reconnect(): Promise<void> {
    await this.disconnect().catch(() => { /* best effort */ });
    await this.connect();
  }

  /** Destroy everything (called on engine shutdown). */
  abstract destroy(): Promise<void>;

  /** Current state snapshot. */
  getStatus(): IntegrationStateSnapshot {
    return this.state.snapshot();
  }

  /** Emit a normalized event onto the EventBus (via the engine). */
  protected emitEvent(event: NormalizedEvent) {
    this.state.markEvent();
    this.emit('event', event);
  }

  protected emitError(err: unknown) {
    this.emit('integration-error', err);
  }
}
