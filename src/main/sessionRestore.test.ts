/**
 * Integration coverage for session restore.
 *
 * `persistableTabs` and `restoreOpenTabs` live in main/index.ts, which cannot
 * be imported here: it calls app.on(...) and builds a BrowserWindow at module
 * scope. The two helpers below are kept deliberately identical to those
 * functions so the save/restore contract — especially the private-tab
 * filtering and the active-index arithmetic that depends on it — is covered.
 * If you change either function in index.ts, change it here too.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSession, flushSessionSave, clearSession, type PersistedTab } from './session';
import { isAllowedNavigationUrl, normalizeNavigationUrl } from '../shared/navigation';

interface Tab {
  id: string;
  url: string;
  title: string;
  favicon?: string;
  privateMode: boolean;
  pinned: boolean;
}

// Mirrors persistableTabs() in main/index.ts
function persistableTabs(tabs: Tab[], activeTabId: string) {
  const ordered = tabs.filter((t) => !t.privateMode && t.url && t.url !== 'about:blank');
  const activeIndex = ordered.findIndex((t) => t.id === activeTabId);
  return {
    tabs: ordered.map((t): PersistedTab => ({
      url: t.url,
      title: t.title,
      favicon: t.favicon,
      pinned: t.pinned,
    })),
    activeIndex: activeIndex >= 0 ? activeIndex : 0,
  };
}

// Mirrors restoreOpenTabs() in main/index.ts
function restoreOpenTabs(): { tabs: Tab[]; activeTabId: string } | null {
  const saved = loadSession();
  if (!saved) return null;
  const restored: Tab[] = [];
  let n = 1;
  for (const e of saved.tabs) {
    const url = normalizeNavigationUrl(e.url);
    if (!url) continue;
    restored.push({
      id: `tab-${n++}`,
      url,
      title: e.title || 'Loading...',
      favicon: e.favicon,
      privateMode: false,
      pinned: e.pinned,
    });
  }
  if (!restored.length) return null;
  return {
    tabs: restored,
    activeTabId: restored[Math.min(saved.activeIndex, restored.length - 1)].id,
  };
}

test.beforeEach(() => clearSession());

test('private tabs never reach disk', () => {
  const tabs: Tab[] = [
    { id: 'tab-1', url: 'https://public.com', title: 'Public', privateMode: false, pinned: false },
    { id: 'tab-2', url: 'https://secret.com', title: 'Secret', privateMode: true, pinned: false },
  ];
  const { tabs: p, activeIndex } = persistableTabs(tabs, 'tab-2');
  flushSessionSave(p, activeIndex);

  const raw = JSON.stringify(loadSession());
  assert.ok(!raw.includes('secret.com'), 'a private tab leaked into the session file');
  assert.equal(loadSession()!.tabs.length, 1);
});

test('active index survives when a private tab precedes the active one', () => {
  const tabs: Tab[] = [
    { id: 'tab-1', url: 'https://a.com', title: 'A', privateMode: false, pinned: false },
    { id: 'tab-2', url: 'https://priv.com', title: 'P', privateMode: true, pinned: false },
    { id: 'tab-3', url: 'https://c.com', title: 'C', privateMode: false, pinned: false },
  ];
  // tab-3 is active; after filtering the private tab it is at index 1, not 2.
  const { tabs: p, activeIndex } = persistableTabs(tabs, 'tab-3');
  assert.equal(activeIndex, 1, 'index must be computed after filtering');
  flushSessionSave(p, activeIndex);

  const out = restoreOpenTabs();
  assert.ok(out);
  const active = out.tabs.find((t) => t.id === out.activeTabId);
  assert.equal(active!.url, 'https://c.com', 'the wrong tab was focused after restore');
});

test('active tab being private falls back to the first tab', () => {
  const tabs: Tab[] = [
    { id: 'tab-1', url: 'https://a.com', title: 'A', privateMode: false, pinned: false },
    { id: 'tab-2', url: 'https://priv.com', title: 'P', privateMode: true, pinned: false },
  ];
  const { tabs: p, activeIndex } = persistableTabs(tabs, 'tab-2');
  assert.equal(activeIndex, 0);
  flushSessionSave(p, activeIndex);
  const out = restoreOpenTabs();
  assert.equal(out!.tabs.find((t) => t.id === out!.activeTabId)!.url, 'https://a.com');
});

test('full round trip preserves order, titles and pins', () => {
  const tabs: Tab[] = [
    { id: 'tab-1', url: 'https://one.com', title: 'One', privateMode: false, pinned: true },
    { id: 'tab-2', url: 'https://two.com', title: 'Two', privateMode: false, pinned: false },
    { id: 'tab-3', url: 'https://three.com', title: 'Three', privateMode: false, pinned: false },
  ];
  const { tabs: p, activeIndex } = persistableTabs(tabs, 'tab-2');
  flushSessionSave(p, activeIndex);

  const out = restoreOpenTabs()!;
  assert.deepEqual(
    out.tabs.map((t) => t.url),
    ['https://one.com', 'https://two.com', 'https://three.com']
  );
  assert.deepEqual(
    out.tabs.map((t) => t.title),
    ['One', 'Two', 'Three']
  );
  assert.equal(out.tabs[0].pinned, true);
  assert.equal(out.tabs.find((t) => t.id === out.activeTabId)!.url, 'https://two.com');
});

test('a strip of only blank/private tabs yields no restore', () => {
  const tabs: Tab[] = [
    { id: 'tab-1', url: 'about:blank', title: 'New Tab', privateMode: false, pinned: false },
    { id: 'tab-2', url: 'https://p.com', title: 'P', privateMode: true, pinned: false },
  ];
  const { tabs: p, activeIndex } = persistableTabs(tabs, 'tab-1');
  flushSessionSave(p, activeIndex);
  assert.equal(restoreOpenTabs(), null, 'caller should open a fresh blank tab instead');
});

test('every restored URL passes the navigation allowlist', () => {
  const tabs: Tab[] = [
    { id: 'tab-1', url: 'https://ok.com', title: 'OK', privateMode: false, pinned: false },
    {
      id: 'tab-2',
      url: 'zyphora://downloads',
      title: 'Downloads',
      privateMode: false,
      pinned: false,
    },
  ];
  const { tabs: p, activeIndex } = persistableTabs(tabs, 'tab-1');
  flushSessionSave(p, activeIndex);
  for (const t of restoreOpenTabs()!.tabs) {
    assert.ok(isAllowedNavigationUrl(t.url), `restored a disallowed URL: ${t.url}`);
  }
});
