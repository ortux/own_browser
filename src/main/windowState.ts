/**
 * windowState.ts — remember the browser window's size, position and
 * maximised state across restarts.
 *
 * The window previously opened at a hardcoded 1200x800 every launch, so anyone
 * on an ultrawide or a small laptop screen re-resized it every time.
 */

import { screen, type BrowserWindow, type Rectangle } from 'electron';
import { DebouncedWriter, readJsonFile, isRecord } from './jsonStore';

export interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  maximised: boolean;
}

const FILENAME = 'window-state.json';

export const DEFAULT_WINDOW_STATE: WindowState = {
  width: 1200,
  height: 800,
  maximised: false,
};

/** Matches the minWidth/minHeight passed to BrowserWindow. */
const MIN_WIDTH = 600;
const MIN_HEIGHT = 400;

/**
 * Resize and move events fire continuously while the user drags, so the write
 * is coalesced. The delay is short because a force-quit should still keep a
 * roughly-correct geometry.
 */
const writer = new DebouncedWriter<WindowState>(FILENAME, 500);

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * True when the rectangle is at least partly on a connected display.
 *
 * Without this check, a window last used on a second monitor that is no longer
 * plugged in reopens at coordinates the user cannot reach, which looks
 * identical to the app failing to launch.
 */
function isOnSomeDisplay(bounds: Rectangle): boolean {
  return screen.getAllDisplays().some((display) => {
    const area = display.workArea;
    // Require a meaningful overlap rather than a single shared pixel, so a
    // window is not restored almost entirely off-screen.
    const overlapX =
      Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x);
    const overlapY =
      Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y);
    return overlapX >= 80 && overlapY >= 40;
  });
}

/**
 * Read the saved geometry, falling back to the default. Position is dropped
 * (letting the OS centre the window) whenever it would land off-screen.
 */
export function loadWindowState(): WindowState {
  const parsed = readJsonFile(FILENAME);
  if (!isRecord(parsed)) return { ...DEFAULT_WINDOW_STATE };

  const { width, height, x, y, maximised } = parsed;
  if (!isFiniteNumber(width) || !isFiniteNumber(height)) {
    return { ...DEFAULT_WINDOW_STATE };
  }

  const state: WindowState = {
    width: Math.max(MIN_WIDTH, Math.round(width)),
    height: Math.max(MIN_HEIGHT, Math.round(height)),
    maximised: maximised === true,
  };

  if (isFiniteNumber(x) && isFiniteNumber(y)) {
    const candidate: Rectangle = {
      x: Math.round(x),
      y: Math.round(y),
      width: state.width,
      height: state.height,
    };
    // screen is only available after the app is ready; guard so a very early
    // call cannot throw.
    let usable = false;
    try {
      usable = isOnSomeDisplay(candidate);
    } catch {
      usable = false;
    }
    if (usable) {
      state.x = candidate.x;
      state.y = candidate.y;
    }
  }

  return state;
}

/**
 * Persist geometry whenever the user finishes moving or resizing the window.
 *
 * While maximised or full-screen, `getBounds()` reports the expanded
 * rectangle; saving that would lose the size to restore *to*. Electron's
 * `getNormalBounds()` reports the pre-maximise rectangle, so it is used
 * instead.
 */
export function trackWindowState(window: BrowserWindow): void {
  const capture = () => {
    if (window.isDestroyed()) return;
    const bounds = window.getNormalBounds();
    writer.schedule({
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      maximised: window.isMaximized(),
    });
  };

  window.on('resized', capture);
  window.on('moved', capture);
  window.on('maximize', capture);
  window.on('unmaximize', capture);
  // 'close' fires while the window still exists; 'closed' would be too late.
  window.on('close', () => {
    if (window.isDestroyed()) return;
    const bounds = window.getNormalBounds();
    writer.flush({
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      maximised: window.isMaximized(),
    });
  });
}

/** Write any queued geometry immediately. */
export function flushWindowState(): void {
  writer.flush();
}
