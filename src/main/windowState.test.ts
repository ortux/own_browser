/**
 * windowState only has one interesting behaviour worth protecting: refusing to
 * restore a position that is no longer on any connected display. A window
 * reopened at unreachable coordinates is indistinguishable, to the user, from
 * the app failing to start.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { displays } from './__mocks__/electron';
import { writeJsonFile, removeJsonFile } from './jsonStore';
import { loadWindowState, DEFAULT_WINDOW_STATE } from './windowState';

const FILENAME = 'window-state.json';

test.beforeEach(() => {
  removeJsonFile(FILENAME);
  displays.length = 0;
  displays.push({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } });
});

test('a missing file yields the defaults', () => {
  assert.deepEqual(loadWindowState(), DEFAULT_WINDOW_STATE);
});

test('a corrupt file yields the defaults', () => {
  writeJsonFile(FILENAME, { width: 'wide', height: null });
  assert.deepEqual(loadWindowState(), DEFAULT_WINDOW_STATE);
});

test('a valid on-screen geometry round-trips', () => {
  writeJsonFile(FILENAME, { width: 1000, height: 700, x: 120, y: 80, maximised: false });
  assert.deepEqual(loadWindowState(), {
    width: 1000,
    height: 700,
    x: 120,
    y: 80,
    maximised: false,
  });
});

test('the maximised flag is preserved', () => {
  writeJsonFile(FILENAME, { width: 1000, height: 700, maximised: true });
  assert.equal(loadWindowState().maximised, true);
});

test('a position on a disconnected monitor is dropped but the size is kept', () => {
  writeJsonFile(FILENAME, { width: 1000, height: 700, x: 3000, y: 200, maximised: false });
  const state = loadWindowState();
  assert.equal(state.x, undefined, 'the OS should centre the window instead');
  assert.equal(state.y, undefined);
  assert.equal(state.width, 1000, 'the size is still worth restoring');
});

test('a position is kept once the second monitor is plugged back in', () => {
  displays.push({ workArea: { x: 1920, y: 0, width: 1920, height: 1080 } });
  writeJsonFile(FILENAME, { width: 1000, height: 700, x: 2400, y: 200, maximised: false });
  assert.equal(loadWindowState().x, 2400);
});

test('a barely-visible sliver off the screen edge is rejected', () => {
  writeJsonFile(FILENAME, { width: 1000, height: 700, x: 1900, y: 200, maximised: false });
  assert.equal(loadWindowState().x, undefined);
});

test('sizes below the window minimums are raised', () => {
  writeJsonFile(FILENAME, { width: 100, height: 50, maximised: false });
  const state = loadWindowState();
  assert.equal(state.width, 600);
  assert.equal(state.height, 400);
});
