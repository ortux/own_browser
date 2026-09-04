/**
 * agent.ts — executes validated agent actions against a guest page.
 *
 * Input strategy (hybrid, as chosen):
 *   - Real OS-level input via `sendInputEvent` is preferred. Pages see
 *     `isTrusted: true` events indistinguishable from a human, so sites that
 *     reject synthetic events still work, and typing/scrolling can be paced to
 *     look human.
 *   - DOM injection is the fallback for the cases real input cannot express:
 *     an element inside a scrollable container, a `<select>` popup (which is
 *     native chrome and cannot be driven by synthetic clicks), or an element
 *     that stays offscreen after scrolling.
 *
 * Nothing here accepts a script from anywhere. The injected helper is bundled
 * at build time and only ever called with structured arguments.
 */

import type { WebContents } from 'electron';
import type { AgentAction, AgentSnapshot } from '../shared/agent';
// Re-exported for existing callers; the logic is shared so it can be tested
// without pulling the main-process bundle (and its ?raw import) into scope.
export { isSensitiveElement } from '../shared/agent';
import agentPageSource from './injected/agentPage.js?raw';

/** Tabs that already have the helper installed, per navigation. */
const installed = new WeakMap<WebContents, string>();

async function ensureInstalled(wc: WebContents): Promise<void> {
  const url = wc.getURL();
  if (installed.get(wc) === url) return;
  try {
    await wc.executeJavaScript(agentPageSource);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Could not inject the agent helper into this page. ` +
        `It may be a special page (chrome-error, about:blank) or have strict Content Security Policy. ` +
        `Try navigating to a regular website first. (${message})`
    );
  }
  installed.set(wc, url);
}

/** Randomised delay, so the agent does not move with machine regularity. */
function jitter(base: number, spread = 0.4): Promise<void> {
  const ms = base * (1 - spread + Math.random() * spread * 2);
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

/**
 * Wait until a page has actually finished loading.
 *
 * A fixed sleep after navigation is wrong in both directions: too short on a
 * slow site (the agent snapshots a half-built DOM and picks refs that vanish
 * a moment later) and wasted time on a fast one. This resolves on the real
 * lifecycle event instead, with a timeout so a page that never stops loading
 * — long-polling, hanging analytics, video — cannot wedge the run.
 */
export function waitForPageLoad(
  wc: WebContents,
  timeoutMs = 15_000,
  signal?: AbortSignal
): Promise<void> {
  return new Promise((resolve) => {
    if (wc.isDestroyed() || signal?.aborted) {
      resolve();
      return;
    }

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      wc.removeListener('did-stop-loading', finish);
      wc.removeListener('did-finish-load', finish);
      wc.removeListener('did-fail-load', finish);
      wc.removeListener('destroyed', finish);
      signal?.removeEventListener('abort', finish);
      resolve();
    };

    const timer = setTimeout(finish, timeoutMs);
    // Stop must be felt immediately, not after a slow page finishes.
    signal?.addEventListener('abort', finish, { once: true });

    // did-stop-loading covers the ordinary case; did-fail-load matters because
    // an error page is still a page the agent must be able to see and report.
    wc.once('did-stop-loading', finish);
    wc.once('did-finish-load', finish);
    wc.once('did-fail-load', finish);
    wc.once('destroyed', finish);

    // The navigation may already have completed before we attached.
    if (!wc.isLoading()) finish();
  });
}

/**
 * Wait for the DOM to stop changing, for pages that finish loading and only
 * then render their real content from JavaScript.
 *
 * Without this, a client-rendered form is frequently still an empty shell at
 * did-stop-loading, so the snapshot contains none of the fields the agent
 * needs. Polls the interactive-element count and returns once it holds steady.
 */
async function waitForStableDom(
  wc: WebContents,
  timeoutMs = 3_000,
  signal?: AbortSignal
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let previous = -1;
  let stableRounds = 0;

  while (Date.now() < deadline && !wc.isDestroyed() && !signal?.aborted) {
    let count: number;
    try {
      count = (await wc.executeJavaScript(
        'document.querySelectorAll("a,button,input,select,textarea,[role]").length'
      )) as number;
    } catch {
      return; // Page navigated out from under us; the caller re-snapshots.
    }

    if (count === previous && count > 0) {
      stableRounds++;
      // Two consecutive identical readings is enough to call it settled.
      if (stableRounds >= 2) return;
    } else {
      stableRounds = 0;
    }
    previous = count;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

/** Wait for a navigation to fully settle: load event, then DOM quiescence. */
export async function waitForPageReady(wc: WebContents, signal?: AbortSignal): Promise<void> {
  await waitForPageLoad(wc, 15_000, signal);
  await waitForStableDom(wc, 3_000, signal);
}

/**
 * Settle after an action that may or may not have navigated.
 *
 * A click on a link or a submit button starts a navigation, and snapshotting
 * mid-flight yields refs belonging to a page that is already gone. Give the
 * navigation a brief window to start; if none does, return at once.
 */
export async function settleAfterAction(wc: WebContents, signal?: AbortSignal): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 250));
  if (wc.isDestroyed() || signal?.aborted) return;
  if (wc.isLoading()) await waitForPageReady(wc, signal);
}

export async function captureSnapshot(wc: WebContents, tabId: string): Promise<AgentSnapshot> {
  await ensureInstalled(wc);
  let raw: Omit<AgentSnapshot, 'tabId'>;
  try {
    raw = (await wc.executeJavaScript('window.__zyphoraAgentSnapshot(150)')) as Omit<
      AgentSnapshot,
      'tabId'
    >;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Could not read the page content. The page may have navigated away or crashed. (${message})`
    );
  }
  if (!raw || typeof raw !== 'object') {
    throw new Error(
      'The agent helper returned an invalid snapshot. The page may have a Content Security Policy ' +
        'that blocks injected scripts, or the page is still loading.'
    );
  }
  return { ...raw, tabId };
}

async function centreOf(
  wc: WebContents,
  ref: number
): Promise<{ x: number; y: number } | null> {
  // Scroll the element into view first: real input is delivered at viewport
  // coordinates, so an offscreen element cannot be clicked at all.
  const result = (await wc.executeJavaScript(
    `window.__zyphoraAgentScrollTo(${JSON.stringify(ref)})`
  )) as { ok: boolean; rect?: { x: number; y: number; width: number; height: number } };
  if (!result?.ok || !result.rect) return null;
  const { x, y, width, height } = result.rect;
  if (width <= 0 || height <= 0) return null;
  return { x: Math.round(x + width / 2), y: Math.round(y + height / 2) };
}

/** Move the pointer in a few steps so hover states fire as they would for a human. */
async function glideTo(wc: WebContents, to: { x: number; y: number }): Promise<void> {
  const steps = 3 + Math.floor(Math.random() * 3);
  for (let i = 1; i <= steps; i++) {
    wc.sendInputEvent({
      type: 'mouseMove',
      x: Math.round(to.x * (i / steps)),
      y: Math.round(to.y * (i / steps)),
    });
    await jitter(18);
  }
  wc.sendInputEvent({ type: 'mouseMove', x: to.x, y: to.y });
}

async function realClick(wc: WebContents, ref: number): Promise<boolean> {
  const point = await centreOf(wc, ref);
  if (!point) return false;
  await glideTo(wc, point);
  await jitter(60);
  wc.sendInputEvent({ type: 'mouseDown', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  await jitter(45);
  wc.sendInputEvent({ type: 'mouseUp', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  return true;
}

/** Type one character at a time, with human-ish pacing. */
async function realType(wc: WebContents, text: string, perChar: number): Promise<void> {
  for (const char of text) {
    wc.sendInputEvent({ type: 'char', keyCode: char });
    // Humans pause fractionally longer after a space or punctuation.
    await jitter(/[\s,.]/.test(char) ? perChar * 1.6 : perChar);
  }
}

export interface ExecuteOptions {
  /** Base per-character typing delay. */
  typingDelayMs?: number;
  /** Resolve a `secret: true` type action to its real value. */
  resolveSecret?: (ref: number) => string | null;
}

export interface ExecuteResult {
  ok: boolean;
  reason?: string;
  /** True when the DOM fallback was used instead of real input. */
  fallback?: boolean;
}

/**
 * Run one already-validated action against a page.
 *
 * Navigation and tab actions are handled by the caller (they belong to the tab
 * model, not the page); this only covers page interaction.
 */
export async function executePageAction(
  wc: WebContents,
  action: AgentAction,
  options: ExecuteOptions = {}
): Promise<ExecuteResult> {
  await ensureInstalled(wc);
  const typingDelay = options.typingDelayMs ?? 45;

  switch (action.kind) {
    case 'click': {
      if (await realClick(wc, action.ref)) return { ok: true };
      // Offscreen or unclickable at viewport level — fall back to the DOM.
      const result = (await wc.executeJavaScript(
        `window.__zyphoraAgentAct(${JSON.stringify({ kind: 'click', ref: action.ref })})`
      )) as ExecuteResult;
      return { ...result, fallback: true };
    }

    case 'type': {
      const text = action.secret
        ? (options.resolveSecret?.(action.ref) ?? '')
        : action.text;
      if (!text) return { ok: false, reason: 'no-value' };

      // Focus by clicking, so the page sees a genuine focus sequence.
      const focused = await realClick(wc, action.ref);
      if (focused) {
        // Let the browser finish processing the click's focus event before
        // sending keyboard input. Without this pause the first character is
        // sometimes swallowed because it races with the focus handler.
        await jitter(80);
        // Clear any existing content the way a person would. Select-all is
        // Ctrl+A on Windows/Linux but Meta+A on macOS — Ctrl+A there moves
        // the caret to the line start, so the agent would append to whatever
        // was already in the field instead of replacing it.
        const selectAll = process.platform === 'darwin' ? 'meta' : 'control';
        wc.sendInputEvent({ type: 'keyDown', keyCode: 'A', modifiers: [selectAll] });
        wc.sendInputEvent({ type: 'keyUp', keyCode: 'A', modifiers: [selectAll] });
        await jitter(30);
        wc.sendInputEvent({ type: 'keyDown', keyCode: 'Delete' });
        wc.sendInputEvent({ type: 'keyUp', keyCode: 'Delete' });
        await jitter(30);
        await realType(wc, text, typingDelay);
        return { ok: true };
      }

      const result = (await wc.executeJavaScript(
        `window.__zyphoraAgentAct(${JSON.stringify({ kind: 'type', ref: action.ref, text })})`
      )) as ExecuteResult;
      return { ...result, fallback: true };
    }

    case 'select': {
      // A native <select> popup is browser chrome, not page content, so
      // synthetic clicks cannot drive it. The DOM path is correct here.
      const result = (await wc.executeJavaScript(
        `window.__zyphoraAgentAct(${JSON.stringify(action)})`
      )) as ExecuteResult;
      return result;
    }

    case 'key': {
      wc.sendInputEvent({ type: 'keyDown', keyCode: action.key });
      wc.sendInputEvent({ type: 'keyUp', keyCode: action.key });
      return { ok: true };
    }

    case 'scroll': {
      const amount = action.amount ?? 400;
      const delta = action.direction === 'up' ? amount : -amount;
      // Several smaller wheel events read as a human scroll rather than a jump.
      const steps = 4;
      for (let i = 0; i < steps; i++) {
        wc.sendInputEvent({
          type: 'mouseWheel',
          x: 400,
          y: 300,
          deltaX: 0,
          deltaY: Math.round(delta / steps),
          canScroll: true,
        } as Parameters<WebContents['sendInputEvent']>[0]);
        await jitter(70);
      }
      return { ok: true };
    }

    case 'wait':
      await jitter(action.ms, 0.1);
      return { ok: true };

    default:
      return { ok: false, reason: 'not-a-page-action' };
  }
}

/** Forget cached install state for a destroyed tab. */
export function forgetAgentTab(wc: WebContents): void {
  installed.delete(wc);
}
