/**
 * Tab sleeping discards a live renderer process, so the cost of a wrong
 * decision is asymmetric: sleeping too eagerly loses work and silences audio,
 * while sleeping too little just uses memory. These tests pin the exemptions.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import type { Tab } from './types';
import {
  isSleepExempt,
  selectSleepingTabs,
  clampSleepMinutes,
  DEFAULT_SLEEP_MINUTES,
} from './tabSleep';

const MINUTE = 60_000;
const NOW = 1_700_000_000_000;

function tab(overrides: Partial<Tab> = {}): Tab {
  return {
    id: 'tab-1',
    url: 'https://example.com',
    title: 'Example',
    loading: false,
    canGoBack: false,
    canGoForward: false,
    privateMode: false,
    muted: false,
    audible: false,
    pinned: false,
    ...overrides,
  };
}

function select(
  tabs: Tab[],
  lastActiveAt: Record<string, number>,
  options: {
    activeTabId?: string;
    sleeping?: Set<string>;
    idleMinutes?: number;
    enabled?: boolean;
  } = {}
): Set<string> {
  return selectSleepingTabs({
    tabs,
    activeTabId: options.activeTabId ?? 'active',
    lastActiveAt,
    sleeping: options.sleeping ?? new Set<string>(),
    now: NOW,
    idleMs: (options.idleMinutes ?? 30) * MINUTE,
    enabled: options.enabled ?? true,
  });
}

test('a background tab idle past the threshold sleeps', () => {
  const t = tab({ id: 'bg' });
  const result = select([t], { bg: NOW - 31 * MINUTE });
  assert.deepEqual([...result], ['bg']);
});

test('a background tab inside the threshold stays awake', () => {
  const t = tab({ id: 'bg' });
  const result = select([t], { bg: NOW - 29 * MINUTE });
  assert.equal(result.size, 0);
});

test('the active tab never sleeps, however long the window has been open', () => {
  const t = tab({ id: 'active' });
  const result = select([t], { active: NOW - 500 * MINUTE });
  assert.equal(result.size, 0);
});

test('a tab playing audio never sleeps', () => {
  const t = tab({ id: 'bg', audible: true });
  const result = select([t], { bg: NOW - 999 * MINUTE });
  assert.equal(result.size, 0, 'suspending this would stop the sound for no visible reason');
});

test('a muted but silent tab is still eligible', () => {
  const t = tab({ id: 'bg', muted: true, audible: false });
  const result = select([t], { bg: NOW - 31 * MINUTE });
  assert.deepEqual([...result], ['bg']);
});

test('a muted tab that is still producing audio is exempt', () => {
  // Chromium reports a muted tab as audible; treat it as active media.
  const t = tab({ id: 'bg', muted: true, audible: true });
  assert.equal(select([t], { bg: NOW - 99 * MINUTE }).size, 0);
});

test('a pinned tab never sleeps', () => {
  const t = tab({ id: 'bg', pinned: true });
  assert.equal(select([t], { bg: NOW - 99 * MINUTE }).size, 0);
});

test('a loading tab is not discarded mid-navigation', () => {
  const t = tab({ id: 'bg', loading: true });
  assert.equal(select([t], { bg: NOW - 99 * MINUTE }).size, 0);
});

test('blank and internal pages are skipped', () => {
  const blank = tab({ id: 'blank', url: 'about:blank' });
  const internal = tab({ id: 'dl', url: 'zyphora://downloads' });
  const result = select([blank, internal], { blank: NOW - 99 * MINUTE, dl: NOW - 99 * MINUTE });
  assert.equal(result.size, 0);
});

test('a tab with no recorded activity is left alone', () => {
  const t = tab({ id: 'bg' });
  assert.equal(select([t], {}).size, 0, 'the caller seeds timestamps; never guess');
});

test('an already-sleeping tab stays asleep', () => {
  const t = tab({ id: 'bg' });
  // Its timestamp is recent, but it is already asleep — re-checking the idle
  // clock here would wake it for no reason.
  const result = select([t], { bg: NOW }, { sleeping: new Set(['bg']) });
  assert.deepEqual([...result], ['bg']);
});

test('an already-sleeping tab wakes when it becomes active', () => {
  const t = tab({ id: 'bg' });
  const result = select(
    [t],
    { bg: NOW - 99 * MINUTE },
    {
      activeTabId: 'bg',
      sleeping: new Set(['bg']),
    }
  );
  assert.equal(result.size, 0);
});

test('an already-sleeping tab wakes if it starts playing audio', () => {
  const t = tab({ id: 'bg', audible: true });
  const result = select([t], { bg: NOW - 99 * MINUTE }, { sleeping: new Set(['bg']) });
  assert.equal(result.size, 0);
});

test('disabling the feature wakes everything', () => {
  const t = tab({ id: 'bg' });
  const result = select(
    [t],
    { bg: NOW - 99 * MINUTE },
    {
      sleeping: new Set(['bg']),
      enabled: false,
    }
  );
  assert.equal(result.size, 0);
});

test('only the eligible tabs in a mixed set are chosen', () => {
  const tabs = [
    tab({ id: 'active' }),
    tab({ id: 'idle' }),
    tab({ id: 'fresh' }),
    tab({ id: 'noisy', audible: true }),
    tab({ id: 'pinned', pinned: true }),
  ];
  const stamps = {
    active: NOW - 99 * MINUTE,
    idle: NOW - 99 * MINUTE,
    fresh: NOW - 1 * MINUTE,
    noisy: NOW - 99 * MINUTE,
    pinned: NOW - 99 * MINUTE,
  };
  assert.deepEqual([...select(tabs, stamps)], ['idle']);
});

test('the threshold is honoured exactly at the boundary', () => {
  const t = tab({ id: 'bg' });
  assert.equal(select([t], { bg: NOW - 30 * MINUTE }).size, 1, '>= is intentional');
});

test('a custom threshold is respected', () => {
  const t = tab({ id: 'bg' });
  assert.equal(select([t], { bg: NOW - 20 * MINUTE }, { idleMinutes: 60 }).size, 0);
  assert.equal(select([t], { bg: NOW - 20 * MINUTE }, { idleMinutes: 15 }).size, 1);
});

test('isSleepExempt is usable on its own', () => {
  assert.equal(isSleepExempt(tab({ id: 'x' }), 'other'), false);
  assert.equal(isSleepExempt(tab({ id: 'x' }), 'x'), true);
});

test('the configured interval is clamped to a sane range', () => {
  assert.equal(clampSleepMinutes(1), 5);
  assert.equal(clampSleepMinutes(99_999), 720);
  assert.equal(clampSleepMinutes(45), 45);
  assert.equal(clampSleepMinutes(Number.NaN), DEFAULT_SLEEP_MINUTES);
  assert.equal(clampSleepMinutes(30.4), 30);
});
