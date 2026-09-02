/**
 * Tab mute lives in the main process rather than on the <webview> element
 * because a guest webContents is torn down and re-created on reload, on
 * crash-recovery, and on session restore — each time defaulting to unmuted.
 * These tests mirror the reducer logic in index.ts so that contract is pinned
 * down without needing a real Electron runtime.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

interface FakeTab {
  id: string;
  muted: boolean;
  audible: boolean;
}

/** Stand-in for Electron's WebContents, recording setAudioMuted calls. */
class FakeContents {
  muted = false;
  destroyed = false;
  setAudioMuted(value: boolean): void {
    if (this.destroyed) throw new Error('setAudioMuted on destroyed contents');
    this.muted = value;
  }
  isDestroyed(): boolean {
    return this.destroyed;
  }
}

/** A miniature of the tab/webContents bookkeeping in index.ts. */
class Model {
  tabs = new Map<string, FakeTab>();
  contentsByTab = new Map<string, FakeContents>();
  renders = 0;

  addTab(id: string): FakeTab {
    const tab = { id, muted: false, audible: false };
    this.tabs.set(id, tab);
    return tab;
  }

  private updateRendererState(): void {
    this.renders++;
  }

  /** case 'set-tab-muted' */
  setMuted(tabId: string, muted: boolean): void {
    const tab = this.tabs.get(tabId);
    if (!tab) return;
    tab.muted = muted;
    const wc = this.contentsByTab.get(tabId);
    if (wc && !wc.isDestroyed()) wc.setAudioMuted(muted);
    this.updateRendererState();
  }

  /** case 'webview-attached' */
  attach(tabId: string, wc: FakeContents): void {
    const tab = this.tabs.get(tabId);
    if (!tab) return;
    this.contentsByTab.set(tabId, wc);
    if (tab.muted) wc.setAudioMuted(true);
  }

  /** contents.on('audio-state-changed') */
  audioStateChanged(tabId: string, audible: boolean): void {
    const tab = this.tabs.get(tabId);
    if (!tab || tab.audible === audible) return;
    tab.audible = audible;
    this.updateRendererState();
  }
}

test('muting a tab silences its live guest', () => {
  const model = new Model();
  model.addTab('tab-1');
  const wc = new FakeContents();
  model.attach('tab-1', wc);

  model.setMuted('tab-1', true);
  assert.equal(wc.muted, true);
  assert.equal(model.tabs.get('tab-1')?.muted, true);

  model.setMuted('tab-1', false);
  assert.equal(wc.muted, false);
});

test('a tab muted before its guest attaches is silenced on attach', () => {
  const model = new Model();
  model.addTab('tab-1');

  model.setMuted('tab-1', true);
  const wc = new FakeContents();
  model.attach('tab-1', wc);

  assert.equal(wc.muted, true, 'the flag must be replayed onto the new guest');
});

test('mute survives a reload that replaces the webContents', () => {
  const model = new Model();
  model.addTab('tab-1');
  const first = new FakeContents();
  model.attach('tab-1', first);
  model.setMuted('tab-1', true);

  // Reload: the old guest goes away and a fresh, unmuted one attaches.
  first.destroyed = true;
  const second = new FakeContents();
  model.attach('tab-1', second);

  assert.equal(second.muted, true);
});

test('muting a tab with no guest does not throw and still records the flag', () => {
  const model = new Model();
  model.addTab('tab-1');
  model.setMuted('tab-1', true);
  assert.equal(model.tabs.get('tab-1')?.muted, true);
});

test('muting a destroyed guest does not throw', () => {
  const model = new Model();
  model.addTab('tab-1');
  const wc = new FakeContents();
  model.attach('tab-1', wc);
  wc.destroyed = true;

  assert.doesNotThrow(() => model.setMuted('tab-1', true));
  assert.equal(model.tabs.get('tab-1')?.muted, true);
});

test('mute is per tab', () => {
  const model = new Model();
  model.addTab('tab-1');
  model.addTab('tab-2');
  const a = new FakeContents();
  const b = new FakeContents();
  model.attach('tab-1', a);
  model.attach('tab-2', b);

  model.setMuted('tab-1', true);
  assert.equal(a.muted, true);
  assert.equal(b.muted, false);
  assert.equal(model.tabs.get('tab-2')?.muted, false);
});

test('a message for an unknown tab is ignored', () => {
  const model = new Model();
  assert.doesNotThrow(() => model.setMuted('ghost', true));
  assert.equal(model.renders, 0);
});

test('the audible flag tracks Chromium audio state', () => {
  const model = new Model();
  model.addTab('tab-1');

  model.audioStateChanged('tab-1', true);
  assert.equal(model.tabs.get('tab-1')?.audible, true);

  model.audioStateChanged('tab-1', false);
  assert.equal(model.tabs.get('tab-1')?.audible, false);
});

test('a repeated audio state does not re-render the tab strip', () => {
  const model = new Model();
  model.addTab('tab-1');

  model.audioStateChanged('tab-1', true);
  const after = model.renders;
  model.audioStateChanged('tab-1', true);
  model.audioStateChanged('tab-1', true);

  assert.equal(model.renders, after, 'audio-state-changed can fire repeatedly');
});

test('a muted tab can still report itself as audible', () => {
  const model = new Model();
  model.addTab('tab-1');
  const wc = new FakeContents();
  model.attach('tab-1', wc);

  model.setMuted('tab-1', true);
  model.audioStateChanged('tab-1', true);

  const tab = model.tabs.get('tab-1');
  // Chromium reports the page as producing audio even while output is muted.
  // The UI relies on this to keep showing the indicator on a muted tab.
  assert.equal(tab?.muted, true);
  assert.equal(tab?.audible, true);
});
