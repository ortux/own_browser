import assert from 'node:assert/strict';
import test from 'node:test';
import { WhatsAppAdapter } from './WhatsAppAdapter';

test('message handling survives metadata lookup failures and deduplicates callbacks', async () => {
  const adapter = new WhatsAppAdapter({
    id: 'whatsapp-test',
    provider: 'whatsapp',
    displayName: 'WhatsApp',
  });
  const events: Array<{ id: string; type: string; data: Record<string, unknown> }> = [];
  adapter.on('event', (event) => events.push(event));

  const message = {
    id: { _serialized: 'message-1' },
    from: '281363894763552@c.us',
    fromMe: false,
    isStatus: false,
    timestamp: 1_700_000_000,
    body: 'Hello from another phone',
    hasMedia: false,
    type: 'chat',
    getContact: async () => { throw new Error('contact unavailable'); },
    getChat: async () => { throw new Error('chat unavailable'); },
  };

  const handleMessage = (adapter as unknown as {
    handleMessage: (value: typeof message) => Promise<void>;
  }).handleMessage.bind(adapter);

  await handleMessage(message);
  await handleMessage(message);

  assert.equal(events.length, 1);
  assert.equal(events[0].id, 'whatsapp-msg-message-1');
  assert.equal(events[0].type, 'message.received');
  assert.equal(events[0].data.preview, 'Hello from another phone');
});

test('message metadata fallback IDs do not become undefined', async () => {
  const adapter = new WhatsAppAdapter({
    id: 'whatsapp-fallback-test',
    provider: 'whatsapp',
    displayName: 'WhatsApp',
  });
  const events: Array<{ id: string }> = [];
  adapter.on('event', (event) => events.push(event));

  const message = {
    id: {},
    from: '281363894763552@c.us',
    fromMe: false,
    isStatus: false,
    timestamp: 1_700_000_001,
    body: 'A new message',
    hasMedia: false,
    type: 'chat',
    getContact: async () => null,
  };

  const handleMessage = (adapter as unknown as {
    handleMessage: (value: typeof message) => Promise<void>;
  }).handleMessage.bind(adapter);
  await handleMessage(message);

  assert.equal(events.length, 1);
  assert.notEqual(events[0].id, 'whatsapp-msg-undefined');
});
