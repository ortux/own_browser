import assert from 'node:assert/strict';
import { SEARCH_INDEX, searchSettings } from './searchIndex';
import type { SectionId } from './sections';

// Section ids used by the index. Kept in sync with sections.ts by the type
// system: adding one there without handling it here fails the compile.
const KNOWN_SECTIONS: SectionId[] = [
  'general',
  'appearance',
  'search',
  'tabs',
  'languages',
  'accessibility',
  'privacy',
  'security',
  'permissions',
  'passwords',
  'clear-data',
  'ai-agent',
  'agent-permissions',
  'memory',
  'ai-models',
  'downloads',
  'extensions',
  'default-browser',
  'sync',
  'performance',
  'startup',
  'updates',
  'about',
];

// Too short a query returns nothing, so the results view never flashes open on
// the first keystroke.
assert.deepEqual(searchSettings(''), []);
assert.deepEqual(searchSettings('d'), []);

const downloads = searchSettings('download').map((entry) => entry.title);
for (const expected of [
  'Download location',
  'Ask where to save each file',
  'Show download notifications',
]) {
  assert.ok(downloads.includes(expected), `"download" should surface "${expected}"`);
}

const tabs = searchSettings('tab').map((entry) => entry.title);
for (const expected of [
  'Show tab previews',
  'Open new tabs next to the current tab',
  'Warn before closing multiple tabs',
]) {
  assert.ok(tabs.includes(expected), `"tab" should surface "${expected}"`);
}

// Descriptions are searched too, not just titles.
assert.ok(
  searchSettings('utm').some((entry) => entry.title === 'Remove tracking parameters'),
  'keyword-only matches must still be found'
);

// Multi-word queries must require every term.
assert.ok(searchSettings('font size').every((entry) => /font/i.test(entry.title)));
assert.deepEqual(searchSettings('zzzz nothing'), []);

// Results are capped so the list stays scannable.
assert.ok(searchSettings('s').length <= 12);
assert.ok(searchSettings('show').length <= 12);

// Every indexed entry must point at a real sidebar section, or clicking a
// result would navigate nowhere.
for (const entry of SEARCH_INDEX) {
  assert.ok(
    KNOWN_SECTIONS.includes(entry.section),
    `unknown section "${entry.section}" in search index`
  );
  assert.ok(entry.title.length > 0 && entry.description.length > 0);
}

console.log('✓ settings search tests passed');
