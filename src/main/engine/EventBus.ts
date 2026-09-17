/**
 * EventBus
 * Central event routing layer.
 * Integrations emit events here; processors/managers subscribe.
 */

import { EventEmitter } from 'events';
import type { NormalizedEvent } from './types/events';

export type EventBusListener = (event: NormalizedEvent) => void | Promise<void>;

export class EventBus extends EventEmitter {
  private static readonly CHANNEL = 'event';

  /** Publish a normalized event from any integration. */
  publish(event: NormalizedEvent) {
    this.emit(EventBus.CHANNEL, event);
  }

  /** Subscribe to all normalized events. */
  subscribe(listener: EventBusListener) {
    this.on(EventBus.CHANNEL, listener);
    return () => this.off(EventBus.CHANNEL, listener);
  }

  /** Subscribe once. */
  subscribeOnce(listener: EventBusListener) {
    this.once(EventBus.CHANNEL, listener);
  }
}

// Singleton
export const eventBus = new EventBus();
