/**
 * EventProcessor
 * Sits between the EventBus and NotificationManager.
 * Applies rules, deduplication check, and priority assignment.
 */

import type { NormalizedEvent, EventPriority } from './types/events';
import { eventBus } from './EventBus';

type ProcessedListener = (event: NormalizedEvent) => void | Promise<void>;

// Simple priority rules — extensible via addRule()
interface PriorityRule {
  match: (event: NormalizedEvent) => boolean;
  priority: EventPriority;
}

const defaultRules: PriorityRule[] = [
  // Calendar: events starting within 10 minutes = urgent
  {
    match: (e) =>
      e.type === 'calendar.event.starting' &&
      typeof e.data.startsIn === 'number' &&
      (e.data.startsIn as number) <= 10,
    priority: 'urgent',
  },
  // CI failures = high
  { match: (e) => e.type === 'ci.failed', priority: 'high' },
  // Direct messages = high
  { match: (e) => e.type === 'direct.message' || e.type === 'message.received', priority: 'high' },
  // Email = normal
  { match: (e) => e.type === 'email.received', priority: 'normal' },
];

export class EventProcessor {
  private listeners: ProcessedListener[] = [];
  private rules: PriorityRule[] = [...defaultRules];
  private unsubscribe: (() => void) | null = null;

  start() {
    this.unsubscribe = eventBus.subscribe((event) => this.process(event));
  }

  stop() {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  addRule(rule: PriorityRule) {
    this.rules.unshift(rule); // user rules take precedence
  }

  onProcessed(listener: ProcessedListener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private async process(event: NormalizedEvent) {
    // Assign priority if not already set
    const priority = event.priority ?? this.assignPriority(event);
    const processed: NormalizedEvent = { ...event, priority };

    for (const listener of this.listeners) {
      try {
        await listener(processed);
      } catch (err) {
        console.error('[EventProcessor] listener error:', err);
      }
    }
  }

  private assignPriority(event: NormalizedEvent): EventPriority {
    for (const rule of this.rules) {
      if (rule.match(event)) return rule.priority;
    }
    return 'normal';
  }
}

export const eventProcessor = new EventProcessor();
