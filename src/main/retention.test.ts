/**
 * Coverage for history retention and per-site zoom persistence.
 *
 * Both exist to stop unbounded growth: sql.js rewrites the whole database on
 * every write, so an ever-growing history table slows down every page visit.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  initDb,
  addHistory,
  getHistory,
  clearHistory,
  pruneHistory,
  countHistory,
  backdateHistoryForTests,
} from './db';
import {
  getZoomForUrl,
  setZoomForUrl,
  clearZoomLevels,
  flushZoomLevels,
  clampZoom,
  resetZoomCacheForTests,
} from './zoom';

await initDb();

const DAY = 86_400_000;

/** addHistory always stamps "now", so backdating needs a direct write. */
function addAged(url: string, daysAgo: number): void {
  addHistory(url, `Page ${url}`);
  const entries = getHistory(1);
  if (!entries.length) return;
  backdateHistoryForTests(entries[0].id, Date.now() - daysAgo * DAY);
}

test.beforeEach(() => {
  clearHistory();
});

test('entries older than the retention window are pruned', () => {
  addAged('https://old.example', 120);
  addAged('https://recent.example', 5);
  assert.equal(countHistory(), 2);

  const removed = pruneHistory(30);
  assert.equal(removed, 1);
  assert.equal(countHistory(), 1);
  assert.equal(getHistory(10)[0].url, 'https://recent.example');
});

test('a retention of 0 keeps everything', () => {
  addAged('https://ancient.example', 5_000);
  assert.equal(pruneHistory(0), 0);
  assert.equal(countHistory(), 1);
});

test('the row cap keeps only the newest entries', () => {
  for (let i = 0; i < 20; i++) addHistory(`https://site-${i}.example`, `Site ${i}`);
  assert.equal(countHistory(), 20);

  pruneHistory(0, 5);
  assert.equal(countHistory(), 5);
});

test('pruning an empty table is a no-op', () => {
  assert.equal(pruneHistory(30), 0);
  assert.equal(countHistory(), 0);
});

// ── Zoom ─────────────────────────────────────────────────────────────────────

test.beforeEach(() => {
  clearZoomLevels();
  resetZoomCacheForTests();
});

test('zoom is remembered per origin, not per URL', () => {
  setZoomForUrl('https://example.com/page-one?a=1', 1.5);
  assert.equal(getZoomForUrl('https://example.com/totally/different'), 1.5);
});

test('different origins keep independent levels', () => {
  setZoomForUrl('https://a.example', 1.5);
  setZoomForUrl('https://b.example', 0.75);
  assert.equal(getZoomForUrl('https://a.example'), 1.5);
  assert.equal(getZoomForUrl('https://b.example'), 0.75);
});

test('an unseen site reports the default', () => {
  assert.equal(getZoomForUrl('https://never-visited.example'), 1);
});

test('levels are clamped to a sane range', () => {
  assert.equal(clampZoom(99), 3);
  assert.equal(clampZoom(0.01), 0.5);
  assert.equal(clampZoom(Number.NaN), 1);
  assert.equal(setZoomForUrl('https://big.example', 99), 3);
});

test('resetting to 1 forgets the entry rather than storing a redundant one', () => {
  setZoomForUrl('https://example.com', 2);
  assert.equal(getZoomForUrl('https://example.com'), 2);

  setZoomForUrl('https://example.com', 1);
  assert.equal(getZoomForUrl('https://example.com'), 1);

  flushZoomLevels();
  resetZoomCacheForTests();
  assert.equal(getZoomForUrl('https://example.com'), 1, 'and it stays gone after a reload');
});

test('levels survive a reload from disk', () => {
  setZoomForUrl('https://persist.example', 1.25);
  flushZoomLevels();
  resetZoomCacheForTests();
  assert.equal(getZoomForUrl('https://persist.example'), 1.25);
});

test('clearing browsing data drops every level', () => {
  setZoomForUrl('https://a.example', 1.5);
  flushZoomLevels();
  clearZoomLevels();
  resetZoomCacheForTests();
  assert.equal(getZoomForUrl('https://a.example'), 1);
});
