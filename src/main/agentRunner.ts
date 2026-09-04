/**
 * agentRunner.ts — the agent's think/act loop.
 *
 * One run at a time. Each iteration: snapshot the page, ask the model for one
 * action, gate it, execute it, repeat. Keeping it to one action per turn is
 * what makes "stop" instantaneous and what lets the confirmation gate sit in
 * a single place.
 */

import type { WebContents } from 'electron';
import type { AgentAction, AgentElement, AgentEvent, AgentStep } from '../shared/agent';
import {
  resolvePermission,
  hostFromUrl,
  sensitiveCategoryFor,
  type AgentActionId,
  type AgentConfig,
  type PermissionDecision,
} from '../shared/agentConfig';
import { logActivity, getAgentConfig, updateAgentConfig } from './agentConfigStore';
import { resetDownloadCount } from './agentDownloads';
import { notifyAgent } from './agentNotify';
import { describeAction, isSensitiveElement } from '../shared/agent';
import { captureSnapshot, executePageAction, settleAfterAction, waitForPageReady } from './agent';
import { planNextAction } from './agentModel';
import { resolveSecretPlaceholder } from './agentProfile';

export interface AgentHost {
  /** Live guest webContents for a tab, or null. */
  guestForTab: (tabId: string) => WebContents | null;
  activeTabId: () => string;
  listTabs: () => Array<{ tabId: string; title: string; url: string; active: boolean }>;
  createTab: (url?: string) => string;
  activateTab: (tabId: string) => void;
  closeTab: (tabId: string) => void;
  navigate: (tabId: string, url: string) => void;
  /** Push an event to the renderer sidebar. */
  emit: (event: AgentEvent) => void;
}

export type { AgentEvent };

let host: AgentHost | null = null;
export function initAgentRunner(value: AgentHost): void {
  host = value;
}

interface RunContext {
  goal: string;
  config: AgentConfig;
  history: string[];
  abort: AbortController;
  /** Resolves when the user answers a confirm/ask prompt. */
  gate: { resolve: (value: AgentReply) => void } | null;
  /** Set while paused; resolved by resumeAgent(). */
  pause: { resolve: () => void } | null;
  /** Tabs this run has opened, against config.security.maxTabs. */
  tabsOpened: number;
  /** Downloads this run has started, against maxDownloadsPerTask. */
  downloads: number;
  stopped: boolean;
}

let current: RunContext | null = null;

export function isAgentRunning(): boolean {
  return current !== null && !current.stopped;
}

let pauseRequested = false;

/**
 * Pause after the current step finishes.
 *
 * Deliberately not mid-action: interrupting halfway through typing into a
 * field would leave the page in a state neither the user nor the agent
 * expects. Stop remains the immediate control.
 */
export function pauseAgent(): void {
  if (!current || current.stopped) return;
  pauseRequested = true;
}

export function resumeAgent(): void {
  pauseRequested = false;
  current?.pause?.resolve();
}

export function isAgentPaused(): boolean {
  return pauseRequested;
}

/** Park the loop while paused. Returns false if stopped while waiting. */
async function honourPause(context: RunContext, emit: AgentHost['emit']): Promise<boolean> {
  if (!pauseRequested || context.stopped) return !context.stopped;
  emit({ type: 'state', state: 'paused' });
  await new Promise<void>((resolve) => {
    context.pause = { resolve };
  });
  context.pause = null;
  return !context.stopped;
}

/** Stop the run. Safe to call at any point, including mid-action. */
export function stopAgent(): void {
  if (!current) return;
  current.stopped = true;
  current.abort.abort();
  // Release anything waiting on a confirmation so the loop can unwind.
  current.gate?.resolve(false);
  // Release a paused loop too, or stop would not be felt until resume.
  pauseRequested = false;
  current.pause?.resolve();
  host?.emit({ type: 'state', state: 'stopped' });
}

/** Answer a pending confirmation (true/false) or question (string). */
/**
 * How the user can answer the agent.
 *
 * `true`/`false` answer a confirmation, `'always'` also trusts the site, and
 * any other string is a free-text reply to an 'ask'. Kept as one channel so
 * there is a single place the run loop can be unblocked — including by stop.
 */
export type AgentReply = boolean | 'always' | string;

export function respondToAgent(value: AgentReply): void {
  current?.gate?.resolve(value);
}

function waitForGate(context: RunContext): Promise<AgentReply> {
  return new Promise((resolve) => {
    context.gate = { resolve };
  }).then((value) => {
    context.gate = null;
    return value as AgentReply;
  });
}

let stepCounter = 0;
function makeStep(action: AgentAction, reason?: string): AgentStep {
  return {
    id: `step-${++stepCounter}`,
    action,
    reason,
    status: 'pending',
    at: Date.now(),
  };
}

/**
 * Translate a low-level action into the permission the user configured.
 *
 * The settings screen speaks in outcomes ("submit forms", "make purchases")
 * because that is what a person can reason about; the runner speaks in
 * mechanics (click, key). This is the one place the two vocabularies meet, so
 * a click on a Buy button is charged against 'purchase' rather than 'click'.
 */
function permissionForAction(action: AgentAction, elements: AgentElement[]): AgentActionId {
  switch (action.kind) {
    case 'navigate':
      return 'navigate';
    case 'new_tab':
      return 'open_tab';
    case 'close_tab':
      return 'close_tab';
    case 'switch_tab':
      return 'navigate';
    case 'scroll':
      return 'scroll';
    case 'type':
    case 'select':
      return 'read_content';
    case 'key':
      // Enter inside a field is how most forms are submitted.
      return action.key === 'Enter' ? 'submit_form' : 'click';
    case 'click': {
      const el = elements.find((e) => e.ref === action.ref);
      if (!el) return 'click';
      const label = `${el.name} ${el.value ?? ''}`.toLowerCase();
      // A purchase is the one outcome worth pattern-matching for explicitly,
      // since it is the only action that can never be auto-allowed.
      if (/\b(pay|buy|purchase|checkout|place order|order now)\b/.test(label)) return 'purchase';
      if (el.submits || el.type === 'submit') return 'submit_form';
      if (isSensitiveElement(el)) return 'submit_form';
      return 'click';
    }
    default:
      return 'read_content';
  }
}

/**
 * Ask the central policy whether this action may proceed.
 *
 * Returns the decision so the caller can both gate on it and record the
 * permission state in the activity log.
 */
function decide(
  config: AgentConfig,
  action: AgentAction,
  elements: AgentElement[],
  url: string
): { decision: PermissionDecision; actionId: AgentActionId } {
  const actionId = permissionForAction(action, elements);
  return { decision: resolvePermission(config, { action: actionId, url }), actionId };
}

export async function runAgent(goal: string, config: AgentConfig): Promise<void> {
  if (!host) throw new Error('Agent runner not initialised.');
  if (current && !current.stopped) throw new Error('The agent is already running.');

  const context: RunContext = {
    goal,
    config,
    history: [],
    abort: new AbortController(),
    gate: null,
    pause: null,
    tabsOpened: 0,
    downloads: 0,
    stopped: false,
  };
  current = context;
  resetDownloadCount();

  const emit = host.emit;
  let pendingAnswer: string | undefined;

  try {
    const deadline = Date.now() + config.security.maxRuntimeMinutes * 60_000;
    const maxSteps = Math.min(config.advanced.maxSteps, config.security.maxActionsPerTask);

    for (let step = 0; step < maxSteps; step++) {
      if (!(await honourPause(context, emit))) break;
      // The runtime cap is a backstop against a task that loops forever
      // without ever tripping the step limit (long waits, slow pages).
      if (Date.now() > deadline) {
        emit({
          type: 'message',
          role: 'agent',
          text: `Stopped after ${config.security.maxRuntimeMinutes} minutes, the limit set in Security.`,
        });
        emit({ type: 'state', state: 'done' });
        return;
      }
      if (context.stopped) break;

      emit({ type: 'state', state: 'thinking' });

      const tabId = host.activeTabId();
      // The webview may not have attached its webContents yet (e.g. the agent
      // was started immediately after a navigation). Poll briefly so the user
      // does not have to click "Run" twice.
      let wc = host.guestForTab(tabId);
      if (!wc) {
        const deadline = Date.now() + 3_000;
        while (Date.now() < deadline && !context.stopped) {
          await new Promise((r) => setTimeout(r, 150));
          wc = host.guestForTab(tabId);
          if (wc) break;
        }
      }
      if (!wc) {
        emit({ type: 'error', message: 'No active page for the agent to work with. Make sure a page is loaded and try again.' });
        break;
      }

      const snapshot = await captureSnapshot(wc, tabId);
      if (context.stopped) break;

      const plan = await planNextAction(
        {
          goal,
          snapshot,
          history: context.history,
          tabs: host.listTabs(),
          answer: pendingAnswer,
        },
        config.general.model,
        context.abort.signal
      );
      pendingAnswer = undefined;
      if (context.stopped) break;

      const { action, reason } = plan;
      const record = makeStep(action, reason);
      const description = describeAction(action, snapshot.elements);

      // Terminal actions.
      if (action.kind === 'done') {
        emit({ type: 'message', role: 'agent', text: action.summary });
        emit({ type: 'state', state: 'done' });
        notifyAgent('task_completed', 'Task finished', action.summary);
        return;
      }
      if (action.kind === 'ask') {
        emit({ type: 'state', state: 'awaiting-answer' });
        emit({ type: 'ask', question: action.question });
        notifyAgent('needs_input', 'Needs your input', action.question);
        const answer = await waitForGate(context);
        if (context.stopped || typeof answer !== 'string') break;
        pendingAnswer = answer;
        context.history.push(`Asked: ${action.question} → user said: ${answer}`);
        continue;
      }

      // ── The gate ───────────────────────────────────────────────────────
      // Every action is checked against the central policy. There is no path
      // to performAction that skips this.
      // If the user has said the agent may not use their signed-in sessions,
      // navigation must not proceed into a site where they are authenticated.
      // Enforced here rather than only in the prompt, since the model cannot
      // be relied on to police a security boundary.
      if (!config.sessions.useExistingSessions && action.kind === 'navigate') {
        const targetHost = hostFromUrl(action.url);
        if (targetHost && sensitiveCategoryFor(targetHost)) {
          emit({
            type: 'message',
            role: 'agent',
            text: `I'm not allowed to use your signed-in session on ${targetHost}. You can change that under Login & Sessions.`,
          });
          logActivity({
            domain: targetHost,
            action: `Blocked from opening ${targetHost}`,
            result: 'blocked',
            permission: 'never',
            detail: 'Using signed-in sessions is switched off.',
          });
          context.history.push(`Could not open ${targetHost}: signed-in sessions are off.`);
          continue;
        }
      }

      // Hard per-run caps from Security. Checked before the permission gate so
      // the user is told the limit was hit rather than asked to approve
      // something that would be refused anyway.
      if (action.kind === 'new_tab') {
        if (context.tabsOpened >= config.security.maxTabs) {
          emit({
            type: 'message',
            role: 'agent',
            text: `I've reached the limit of ${config.security.maxTabs} tabs set in Security, so I won't open another.`,
          });
          context.history.push('Tab limit reached; did not open another tab.');
          continue;
        }
        context.tabsOpened++;
      }

      const targetUrl = action.kind === 'navigate' ? action.url : snapshot.url;
      const domain = hostFromUrl(targetUrl) || 'this page';
      const { decision, actionId } = decide(config, action, snapshot.elements, targetUrl);

      if (decision.state === 'never') {
        emit({ type: 'step-update', id: record.id, status: 'rejected', error: decision.reason });
        emit({ type: 'message', role: 'agent', text: `I can't do that: ${decision.reason}` });
        logActivity({
          domain,
          action: description,
          result: 'blocked',
          permission: 'never',
          detail: decision.reason,
        });
        context.history.push(`${description} — not permitted: ${decision.reason}`);
        continue;
      }

      if (decision.state === 'ask') {
        emit({ type: 'state', state: 'awaiting-confirmation' });
        notifyAgent('needs_permission', 'Needs your permission', `${description} on ${domain}`);
        emit({
          type: 'confirm',
          step: record,
          description,
          domain,
          reason: decision.reason,
          actionId,
          // Offering "always allow" for a purchase would defeat the one rule
          // that is supposed to be absolute.
          allowRemember: actionId !== 'purchase',
        });
        logActivity({
          domain,
          action: description,
          result: 'asked',
          permission: 'ask',
          detail: decision.reason,
        });

        const approved = await waitForGate(context);
        if (context.stopped) break;

        if (approved === 'always' && actionId !== 'purchase') {
          // Trust this site from now on, and persist it immediately.
          trustDomain(domain);
        } else if (approved !== true && approved !== 'always') {
          emit({ type: 'step-update', id: record.id, status: 'rejected' });
          logActivity({ domain, action: description, result: 'denied', permission: 'ask' });
          context.history.push(`${description} — you declined`);
          continue;
        }
      }

      emit({ type: 'state', state: 'acting' });
      emit({ type: 'step', step: { ...record, status: 'running' } });

      try {
        await performAction(action, tabId, config, context.abort.signal);
        emit({ type: 'step-update', id: record.id, status: 'done' });
        logActivity({ domain, action: description, result: 'ok', permission: decision.state });
        context.history.push(description);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Action failed';
        emit({ type: 'step-update', id: record.id, status: 'failed', error: message });
        logActivity({
          domain,
          action: description,
          result: 'failed',
          permission: decision.state,
          detail: message,
        });
        context.history.push(`${description} — failed: ${message}`);
      }

      // Pacing between actions, part of the human feel.
      await new Promise((resolve) => setTimeout(resolve, actionDelayFor(config)));
    }

    if (!context.stopped) {
      emit({ type: 'message', role: 'agent', text: 'Reached the step limit for this run.' });
      emit({ type: 'state', state: 'done' });
    }
  } catch (error) {
    if (!context.stopped) {
      const message = error instanceof Error ? error.message : 'The agent hit an error.';
      emit({ type: 'error', message });
      emit({ type: 'state', state: 'error' });
      notifyAgent('task_failed', 'Task failed', message);
    }
  } finally {
    if (current === context) current = null;
  }
}

/** A newly created tab's webContents attaches a moment after creation. */
async function waitForGuest(tabId: string, timeoutMs = 5_000): Promise<WebContents | null> {
  if (!host || !tabId) return null;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const wc = host.guestForTab(tabId);
    if (wc) return wc;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return null;
}

/**
 * How long to pause between actions.
 *
 * Derived from autonomy rather than stored separately: someone who chose
 * "ask before acting" is watching and wants to follow along, while someone on
 * full autonomy wants it done.
 */
function actionDelayFor(config: AgentConfig): number {
  switch (config.autonomy) {
    case 'ask':
      return 600;
    case 'autonomous':
      return 150;
    default:
      return 350;
  }
}

/** Add a domain to the always-allowed list, from a confirmation prompt. */
function trustDomain(domain: string): void {
  if (!domain || domain === 'this page') return;
  const config = getAgentConfig();
  if (config.domains.some((rule) => rule.pattern === domain)) return;
  updateAgentConfig({ domains: [...config.domains, { pattern: domain, state: 'allow' }] });
}

async function performAction(
  action: AgentAction,
  tabId: string,
  config: AgentConfig,
  signal: AbortSignal
): Promise<void> {
  if (!host) throw new Error('Agent runner not initialised.');

  switch (action.kind) {
    case 'navigate': {
      host.navigate(tabId, action.url);
      // Wait on the real load lifecycle rather than a guessed delay, so the
      // next snapshot always describes the page that actually rendered.
      const wc = host.guestForTab(tabId);
      if (wc) await waitForPageReady(wc, signal);
      return;
    }

    case 'new_tab': {
      const newTabId = host.createTab(action.url);
      // A new tab's webContents attaches asynchronously, so poll briefly for
      // it before waiting on its load.
      const wc = await waitForGuest(newTabId);
      if (wc) await waitForPageReady(wc, signal);
      return;
    }

    case 'switch_tab':
      host.activateTab(action.tabId);
      return;

    case 'close_tab':
      host.closeTab(action.tabId);
      return;

    default: {
      const wc = host.guestForTab(tabId);
      if (!wc) throw new Error('The page went away.');
      const result = await executePageAction(wc, action, {
        typingDelayMs: Math.max(15, Math.round(actionDelayFor(config) / 8)),
        // Secret substitution happens here, in main, so the plaintext never
        // travels to the model or the renderer.
        resolveSecret: () =>
          action.kind === 'type' ? resolveSecretPlaceholder(action.text) : null,
      });
      if (!result.ok) throw new Error(result.reason ?? 'Action did not apply.');
      // A click or Enter may have started a navigation; let it land before the
      // next snapshot so the agent never reasons about a page that has gone.
      if (action.kind === 'click' || action.kind === 'key') {
        await settleAfterAction(wc, signal);
      }
    }
  }
}
