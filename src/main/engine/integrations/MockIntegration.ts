/**
 * MockIntegration
 * A fake integration that emits test events on a configurable interval.
 * Used to verify the full Engine → EventBus → NotificationManager → UI pipeline
 * without needing real credentials.
 *
 * Register it via:
 *   applicationEngine.register('mock', (account) => new MockIntegration(account));
 *
 * Connect it via:
 *   applicationEngine.connect({ id: 'mock-1', provider: 'mock', displayName: 'Test' });
 */

import { randomUUID } from 'crypto';
import { Integration } from '../Integration';
import type { IntegrationAccount, IntegrationCapabilities } from '../Integration';
import type { NormalizedEvent } from '../types/events';

const MOCK_EVENTS: Array<Partial<NormalizedEvent>> = [
  {
    type: 'email.received',
    data: {
      sender: 'alice@example.com',
      subject: 'Hello from the Mock engine',
      preview: 'This is a test notification from the Zyphora engine.',
    },
  },
  {
    type: 'message.received',
    data: {
      sender: { name: 'Bob' },
      preview: 'Are you free tomorrow?',
    },
  },
  {
    type: 'calendar.event.starting',
    data: {
      title: 'Team standup',
      startsIn: 5,
    },
  },
  {
    type: 'pr.review_requested',
    data: {
      repo: 'zyphora/browser',
      pr: 'Add notification engine',
      url: 'https://github.com',
    },
  },
];

export class MockIntegration extends Integration {
  readonly id      = 'mock';
  readonly name    = 'Mock Integration';
  readonly version = '1.0.0';
  readonly capabilities: IntegrationCapabilities = {
    notifications: true,
    messaging: false,
    webhooks: false,
    realtime: false,
    polling: true,
  };

  private timer: NodeJS.Timeout | null = null;
  private intervalMs: number;

  constructor(account: IntegrationAccount, intervalMs = 15_000) {
    super(account);
    this.intervalMs = intervalMs;
  }

  async initialize(): Promise<void> {
    this.state.transition('initializing');
    console.info('[MockIntegration] initialized');
  }

  async connect(): Promise<void> {
    this.state.transition('connecting');
    await new Promise<void>((r) => setTimeout(r, 200)); // simulate handshake
    this.state.transition('connected');
    console.info('[MockIntegration] connected — will emit events every', this.intervalMs, 'ms');

    // Emit the first event immediately so the pipeline is verified on startup
    this.tick();

    this.timer = setInterval(() => this.tick(), this.intervalMs);
  }

  async disconnect(): Promise<void> {
    this.stopTimer();
    this.state.transition('disconnected');
    console.info('[MockIntegration] disconnected');
  }

  async destroy(): Promise<void> {
    await this.disconnect();
  }

  private stopTimer() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  private tick() {
    const template = MOCK_EVENTS[Math.floor(Math.random() * MOCK_EVENTS.length)];
    const event: NormalizedEvent = {
      id:        `mock-${randomUUID()}`,
      provider:  'mock',
      accountId: this.account.id,
      type:      template.type!,
      timestamp: Date.now(),
      data:      { ...(template.data ?? {}) },
    };
    this.emitEvent(event);
  }
}
