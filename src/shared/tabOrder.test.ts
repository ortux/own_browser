/**
 * The pinned block is an invariant, not a sort key: pinned tabs are always a
 * contiguous run at the front. Every operation below has to preserve that, or
 * the strip ends up with a pinned tab stranded below unpinned ones.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { sortPinnedFirst, reorderTabs, setPinned, type OrderableTab } from './tabOrder';

function tabs(spec: string): OrderableTab[] {
  // 'a b* c' → b is pinned.
  return spec
    .split(' ')
    .filter(Boolean)
    .map((token) => ({ id: token.replace('*', ''), pinned: token.endsWith('*') }));
}

function ids(list: OrderableTab[]): string {
  return list.map((tab) => (tab.pinned ? `${tab.id}*` : tab.id)).join(' ');
}

// ── sortPinnedFirst ──────────────────────────────────────────────────────────

test('pinned tabs move to the front', () => {
  assert.equal(ids(sortPinnedFirst(tabs('a b* c d*'))), 'b* d* a c');
});

test('relative order within each group is preserved', () => {
  assert.equal(ids(sortPinnedFirst(tabs('a* b* c d'))), 'a* b* c d');
  assert.equal(ids(sortPinnedFirst(tabs('c d a* b*'))), 'a* b* c d');
});

test('sorting an already-sorted list changes nothing', () => {
  assert.equal(ids(sortPinnedFirst(tabs('a* b c'))), 'a* b c');
});

test('all-pinned and all-unpinned lists are untouched', () => {
  assert.equal(ids(sortPinnedFirst(tabs('a* b*'))), 'a* b*');
  assert.equal(ids(sortPinnedFirst(tabs('a b'))), 'a b');
});

test('an empty list is handled', () => {
  assert.deepEqual(sortPinnedFirst([]), []);
});

// ── reorderTabs ──────────────────────────────────────────────────────────────

test('an unpinned tab moves within the unpinned block', () => {
  assert.equal(ids(reorderTabs(tabs('a b c d'), 'd', 'b')), 'a d b c');
});

test('a pinned tab moves within the pinned block', () => {
  assert.equal(ids(reorderTabs(tabs('a* b* c* d'), 'c', 'a')), 'c* a* b* d');
});

test('dragging an unpinned tab into the pinned block is refused', () => {
  const before = tabs('a* b* c d');
  const after = reorderTabs(before, 'd', 'a');
  assert.equal(ids(after), 'a* b* c d');
  assert.equal(after, before, 'the original array is returned so callers can skip a re-render');
});

test('dragging a pinned tab into the unpinned block is refused', () => {
  assert.equal(ids(reorderTabs(tabs('a* b c d'), 'a', 'd')), 'a* b c d');
});

test('dropping a tab on itself is a no-op', () => {
  const before = tabs('a b c');
  assert.equal(reorderTabs(before, 'b', 'b'), before);
});

test('an unknown id is ignored', () => {
  const before = tabs('a b c');
  assert.equal(reorderTabs(before, 'ghost', 'b'), before);
  assert.equal(reorderTabs(before, 'a', 'ghost'), before);
});

test('moving forwards and backwards both land on the target slot', () => {
  assert.equal(ids(reorderTabs(tabs('a b c d'), 'a', 'c')), 'b c a d');
  assert.equal(ids(reorderTabs(tabs('a b c d'), 'c', 'a')), 'c a b d');
});

// ── setPinned ────────────────────────────────────────────────────────────────

test('pinning moves the tab to the end of the pinned block', () => {
  assert.equal(ids(setPinned(tabs('a* b c d'), 'c', true)), 'a* c* b d');
});

test('pinning the first unpinned tab keeps it in place', () => {
  assert.equal(ids(setPinned(tabs('a* b c'), 'b', true)), 'a* b* c');
});

test('unpinning moves the tab to the front of the unpinned block', () => {
  assert.equal(ids(setPinned(tabs('a* b* c d'), 'a', false)), 'b* a c d');
});

test('unpinning the only pinned tab leaves it first', () => {
  assert.equal(ids(setPinned(tabs('a* b c'), 'a', false)), 'a b c');
});

test('setting the state a tab already has is a no-op', () => {
  const before = tabs('a* b c');
  assert.equal(setPinned(before, 'a', true), before);
  assert.equal(setPinned(before, 'b', false), before);
});

test('an unknown id is ignored', () => {
  const before = tabs('a b');
  assert.equal(setPinned(before, 'ghost', true), before);
});

test('setPinned does not mutate the input', () => {
  const before = tabs('a b c');
  setPinned(before, 'c', true);
  assert.equal(ids(before), 'a b c');
});

test('pinning every tab in turn keeps the block contiguous', () => {
  let list = tabs('a b c d');
  list = setPinned(list, 'c', true);
  list = setPinned(list, 'a', true);
  assert.equal(ids(list), 'c* a* b d');

  // The invariant: no unpinned tab appears before a pinned one.
  const firstUnpinned = list.findIndex((tab) => !tab.pinned);
  assert.ok(list.slice(firstUnpinned).every((tab) => !tab.pinned));
});
