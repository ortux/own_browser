/**
 * agentRunner.test.ts — regression tests for the run loop's page resolution.
 *
 * These cover the class of failure behind "the agent says no page is open
 * although one clearly is": the runner used to poll the active tab's guest
 * webContents for exactly three seconds, once, with a tab id captured before
 * the poll began — so a tab that was asleep (its webview re-mounts only on
 * activation, and the guest attaches asynchronously), a tab the agent had
 * just switched to, or a freshly woken tab could all miss the window and
 * kill the run. The blank-new-tab case died outright instead of letting the
 * model navigate somewhere useful.
 *
 * The runner module imports the injected helper via Vite's `?raw`, which the
 * plain esbuild CLI cannot resolve; `scripts/build-runner-test.mjs` bundles
 * this file with a plugin that handles it.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { app, safeStorage } from 'electron';
import {
  initAgentRunner,
  runAgent,
  type AgentHost,
} from './agentRunner';
import { getAgentConfig } from './agentConfigStore';
import type { AgentConfig } from '../shared/agentConfig';
import type { AgentEvent } from '../shared/agent';

// ── Harness ──────────────────────────────────────────────────────────────────

/** A guest webContents stand-in: alive, and snapshottable. */
function makeFakeWc(url: string): Electron.WebContents {
  const fake = {
    destroyed: false,
    isDestroyed: () => fake.destroyed,
    getURL: () => url,
    executeJavaScript: async (source: string) => {
      if (source.includes('__zyphoraAgentSnapshot')) {
        return {
          url,
          title: 'Test Page',
          text: 'page text',
          elements: [
            {
              ref: 1,
              tag: 'a',
              name: 'A link',
              rect: { x: 10, y: 10, width: 40, height: 12 },
              offscreen: false,
            },
          ],
          scroll: { y: 0, height: 800, viewport: 600 },
        };
      }
      return true;
    },
    sendInputEvent: () => {},
    once: () => {},
    removeListener: () => {},
    on: () => {},
    isLoading: () => false,
  };
  return fake as unknown as Electron.WebContents;
}

interface TabInfo {
  tabId: string;
  title: string;
  url: string;
}

/** Mutable browser state the fake host serves. */
function makeWorld(tabs: TabInfo[], activeTabId: string) {
  const guests = new Map<string, ReturnType<typeof makeFakeWc>>();
  const events: AgentEvent[] = [];
  const state = { tabs: new Map(tabs.map((t) => [t.tabId, { ...t }])), activeTabId, guests, events };

  const host: AgentHost = {
    guestForTab: (tabId) => state.guests.get(tabId) ?? null,
    activeTabId: () => state.activeTabId,
    listTabs: () =>
      [...state.tabs.values()].map((t) => ({ ...t, active: t.tabId === state.activeTabId })),
    createTab: (url) => {
      const id = `tab-${state.tabs.size + 1}`;
      state.tabs.set(id, { tabId: id, title: 'New Tab', url: url || 'about:blank' });
      return id;
    },
    activateTab: (tabId) => {
      state.activeTabId = tabId;
      onActivated(tabId);
    },
    closeTab: (tabId) => {
      state.tabs.delete(tabId);
      state.guests.delete(tabId);
      if (state.activeTabId === tabId) state.activeTabId = [...state.tabs.keys()][0] ?? '';
    },
    navigate: (tabId, url) => {
      const tab = state.tabs.get(tabId);
      if (tab) tab.url = url;
      const wc = state.guests.get(tabId);
      if (wc) state.guests.set(tabId, makeFakeWc(url));
    },
    emit: (event) => state.events.push(event),
  };

  /** Subclass hook: what happens when a tab becomes active. */
  let onActivated: (tabId: string) => void = () => {};
  return {
    state,
    host,
    onActivate(fn: (tabId: string) => void) {
      onActivated = fn;
    },
  };
}

/** Sequence of model replies; the last one repeats if the run continues. */
function stubModel(...replies: unknown[]) {
  const queue = [...replies];
  globalThis.fetch = (async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [
        {
          content: {
            parts: [{ text: JSON.stringify(queue.shift() ?? { kind: 'done', summary: 'done' }) }],
          },
        },
      ],
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  })) as any;
}

/**
 * A full, real config (from the store, so every field exists) tuned for
 * tests: full autonomy with the ordinary navigation/click actions allowed, so
 * runs do not stop on confirmation gates.
 */
function testConfig(): AgentConfig {
  const config = structuredClone(getAgentConfig());
  config.autonomy = 'autonomous';
  config.advanced.maxSteps = 8;
  config.advanced.requestTimeoutSeconds = 5;
  config.general.model = 'gemini-2.0-flash';
  return config;
}

/** Seed a usable API key so the planner reaches the stubbed fetch. */
function seedApiKey(): void {
  const stored =
    'enc:v1:' + safeStorage.encryptString('test-key').toString('base64');
  fs.writeFileSync(
    path.join(app.getPath('userData'), 'agent-profile.json'),
    JSON.stringify({ apiKey: stored })
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

test('a guest that attaches after three seconds still works', async () => {
  seedApiKey();
  stubModel({ kind: 'done', summary: 'saw it' });
  const { state, host } = makeWorld(
    [{ tabId: 'tab-1', title: 'Example', url: 'https://example.com' }],
    'tab-1'
  );
  // The old code polled for exactly 3s and then declared "no active page";
  // attach just past that mark to pin the fix.
  setTimeout(() => state.guests.set('tab-1', makeFakeWc('https://example.com')), 3400);
  initAgentRunner(host);

  await runAgent("goal", testConfig());

  assert.ok(
    state.events.some((e) => e.type === 'message' && e.text === 'saw it'),
    'the run should complete once the guest attaches'
  );
  assert.ok(
    !state.events.some((e) => e.type === 'error'),
    'no error should be emitted'
  );
});

test('a blank new-tab page is handled, not fatal', async () => {
  seedApiKey();
  stubModel(
    { kind: 'navigate', url: 'https://example.com', reason: 'the tab is blank' },
    { kind: 'done', summary: 'navigated away' }
  );
  const { state, host } = makeWorld(
    [{ tabId: 'tab-1', title: 'New Tab', url: 'about:blank' }],
    'tab-1'
  );
  // Navigating loads a page, as in a real browser.
  host.navigate = (tabId, url) => {
    const tab = state.tabs.get(tabId);
    if (tab) tab.url = url;
    setTimeout(() => state.guests.set(tabId, makeFakeWc(url)), 100);
  };
  initAgentRunner(host);

  await runAgent("goal", testConfig());

  assert.ok(
    state.events.some((e) => e.type === 'message' && e.text === 'navigated away'),
    'the model should be able to navigate away from the blank tab'
  );
  assert.ok(
    !state.events.some((e) => e.type === 'error' && /No active page/.test(e.message)),
    'the run must not die with "no active page" on a blank tab'
  );
});

test('switching to an unattached (just woken) tab waits for it', async () => {
  seedApiKey();
  stubModel(
    { kind: 'switch_tab', tabId: 'tab-2', reason: 'work happens there' },
    { kind: 'done', summary: 'worked in tab 2' }
  );
  const { state, host, onActivate } = makeWorld(
    [
      { tabId: 'tab-1', title: 'A', url: 'https://a.example.com' },
      { tabId: 'tab-2', title: 'B', url: 'https://b.example.com' },
    ],
    'tab-1'
  );
  state.guests.set('tab-1', makeFakeWc('https://a.example.com'));
  // tab-2 was asleep: its guest only appears a moment after activation.
  onActivate((tabId) => {
    if (tabId === 'tab-2' && !state.guests.has('tab-2')) {
      setTimeout(() => state.guests.set('tab-2', makeFakeWc('https://b.example.com')), 1200);
    }
  });
  initAgentRunner(host);

  await runAgent("goal", testConfig());

  assert.ok(
    state.events.some((e) => e.type === 'message' && e.text === 'worked in tab 2'),
    'the run should continue in the woken tab'
  );
  assert.ok(
    !state.events.some((e) => e.type === 'error'),
    'no error should be emitted'
  );
});

test('a real page whose guest never appears fails clearly, without a bogus follow-up', async () => {
  seedApiKey();
  stubModel({ kind: 'done', summary: 'never reached' });
  const { state, host } = makeWorld(
    [{ tabId: 'tab-1', title: 'Stuck', url: 'https://stuck.example.com' }],
    'tab-1'
  );
  // No guest is ever attached.
  initAgentRunner(host);

  await runAgent("goal", testConfig());

  const error = state.events.find((e) => e.type === 'error');
  assert.ok(error, 'an error should be reported');
  assert.match(error.message, /not responding/);
  assert.ok(
    !state.events.some((e) => e.type === 'message' && /step limit/.test(e.text ?? '')),
    'the misleading "Reached the step limit" message must not follow the error'
  );
  const lastState = [...state.events].reverse().find((e) => e.type === 'state');
  assert.equal(lastState?.state, 'error', 'the run should end in the error state');
});
