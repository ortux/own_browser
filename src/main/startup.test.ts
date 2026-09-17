import assert from 'node:assert/strict';

import { scheduleStartupBootstrap } from './startup';

async function main() {
  const events: string[] = [];

  await scheduleStartupBootstrap({
    openWindow: () => {
      events.push('window');
    },
    tasks: [
      async () => {
        events.push('task-1');
      },
      async () => {
        events.push('task-2');
      },
    ],
  });

  assert.deepEqual(events, ['window', 'task-1', 'task-2']);
  console.log('startup bootstrap ok');
}

void main();
