import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import {
  loadSession,
  clearSession,
  flushSessionSave,
  scheduleSessionSave,
  type PersistedTab,
} from './session';

const sessionFile = path.join(app.getPath('userData'), 'session.json');

function writeRaw(contents: string): void {
  fs.writeFileSync(sessionFile, contents);
}

function tab(overrides: Partial<PersistedTab> = {}): PersistedTab {
  return { url: 'https://example.com', title: 'Example', pinned: false, ...overrides };
}

test.beforeEach(() => {
  clearSession();
});

test('a saved session round-trips', () => {
  flushSessionSave([tab({ url: 'https://a.com' }), tab({ url: 'https://b.com' })], 1);

  const restored = loadSession();
  assert.ok(restored);
  assert.equal(restored.tabs.length, 2);
  assert.equal(restored.tabs[0].url, 'https://a.com');
  assert.equal(restored.activeIndex, 1);
});

test('nothing to restore returns null rather than throwing', () => {
  assert.equal(loadSession(), null);
});

test('an empty tab list is not treated as a restorable session', () => {
  flushSessionSave([], 0);
  assert.equal(loadSession(), null, 'a blank strip should fall through to a new tab');
});

test('dangerous URLs on disk are refused', () => {
  // The session file sits in a user-writable directory, so it is untrusted:
  // a hand-edited javascript: entry must never reach a webview.
  writeRaw(
    JSON.stringify({
      version: 1,
      savedAt: Date.now(),
      activeIndex: 0,
      tabs: [
        { url: 'javascript:alert(1)', title: 'x', pinned: false },
        { url: 'data:text/html,<script>', title: 'x', pinned: false },
        { url: 'chrome-error://chromewebdata/', title: 'x', pinned: false },
        { url: 'https://safe.example', title: 'Safe', pinned: false },
      ],
    })
  );

  const restored = loadSession();
  assert.ok(restored);
  assert.equal(restored.tabs.length, 1, 'only the http(s) entry survives');
  assert.equal(restored.tabs[0].url, 'https://safe.example');
});

test('blank tabs are dropped', () => {
  writeRaw(
    JSON.stringify({
      version: 1,
      savedAt: Date.now(),
      activeIndex: 0,
      tabs: [
        { url: 'about:blank', title: 'New Tab', pinned: false },
        { url: 'https://real.example', title: 'Real', pinned: false },
      ],
    })
  );

  const restored = loadSession();
  assert.ok(restored);
  assert.equal(restored.tabs.length, 1);
  assert.equal(restored.tabs[0].url, 'https://real.example');
});

test('corrupt or unknown files are ignored, not fatal', () => {
  writeRaw('{ not json at all');
  assert.equal(loadSession(), null);

  writeRaw(JSON.stringify({ version: 99, tabs: [tab()], activeIndex: 0 }));
  assert.equal(loadSession(), null, 'a future schema version is not guessed at');

  writeRaw(JSON.stringify({ version: 1, tabs: 'not-an-array', activeIndex: 0 }));
  assert.equal(loadSession(), null);
});

test('an out-of-range active index is clamped', () => {
  writeRaw(
    JSON.stringify({
      version: 1,
      savedAt: Date.now(),
      activeIndex: 99,
      tabs: [tab({ url: 'https://a.com' })],
    })
  );

  const restored = loadSession();
  assert.ok(restored);
  assert.equal(restored.activeIndex, 0);
});

test('pinned state and titles survive', () => {
  flushSessionSave([tab({ url: 'https://p.com', title: 'Pinned', pinned: true })], 0);

  const restored = loadSession();
  assert.ok(restored);
  assert.equal(restored.tabs[0].pinned, true);
  assert.equal(restored.tabs[0].title, 'Pinned');
});

test('the stored strip is capped', () => {
  const many = Array.from({ length: 250 }, (_, i) => tab({ url: `https://site-${i}.com` }));
  flushSessionSave(many, 0);

  const restored = loadSession();
  assert.ok(restored);
  assert.equal(restored.tabs.length, 100, 'restoring 250 renderers at launch is not acceptable');
});

test('clearSession removes the file', () => {
  flushSessionSave([tab()], 0);
  assert.ok(loadSession());
  clearSession();
  assert.equal(loadSession(), null);
});

test('a scheduled save can be flushed synchronously', async () => {
  scheduleSessionSave([tab({ url: 'https://debounced.com' })], 0, 50_000);
  assert.equal(loadSession(), null, 'still waiting on the debounce');

  // This is the quit path: the timer would otherwise die with the event loop.
  flushSessionSave();

  const restored = loadSession();
  assert.ok(restored);
  assert.equal(restored.tabs[0].url, 'https://debounced.com');
});
