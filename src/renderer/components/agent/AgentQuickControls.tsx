/**
 * AgentQuickControls.tsx — the controls that appear while the agent is working.
 *
 * The whole point (§15) is that the user must never have to open Settings to
 * regain control of a running agent. So this shows status, where it is, and
 * what it is allowed to do there, plus stop/pause — and it is where permission
 * requests surface, using the same dialog component as the settings screens so
 * a confirmation never looks like something a webpage could have drawn.
 */

import React from 'react';
import { Bot, Pause, Play, Settings2, ShieldAlert, Square } from 'lucide-react';
import type { AgentEvent, AgentRunState } from '../../../shared/agent';
import { AUTONOMY_LEVELS, hostFromUrl, resolvePermission } from '../../../shared/agentConfig';
import type { AgentActionId } from '../../../shared/agentConfig';
import { useAgentConfig } from '../../stores/agentConfigStore';
import { PermissionBadge, Button } from './AgentUi';

interface ConfirmRequest {
  description: string;
  domain: string;
  reason: string;
  actionId: string;
  allowRemember: boolean;
}

interface Props {
  /** URL of the tab the agent is working in. */
  currentUrl: string;
  onOpenSettings: () => void;
}

const STATE_LABELS: Record<AgentRunState, string> = {
  idle: 'Idle',
  thinking: 'Thinking',
  acting: 'Working',
  'awaiting-confirmation': 'Waiting for you',
  'awaiting-answer': 'Waiting for you',
  paused: 'Paused',
  done: 'Finished',
  stopped: 'Stopped',
  error: 'Error',
};

/** Actions serious enough that "always allow" must not be offered. */
const HIGH_IMPACT: ReadonlySet<string> = new Set<AgentActionId>([
  'purchase',
  'delete_content',
  'send_message',
]);

export const AgentQuickControls: React.FC<Props> = ({ currentUrl, onOpenSettings }) => {
  const config = useAgentConfig((s) => s.config);
  const load = useAgentConfig((s) => s.load);

  const [state, setState] = React.useState<AgentRunState>('idle');
  const [confirm, setConfirm] = React.useState<ConfirmRequest | null>(null);

  React.useEffect(() => {
    return window.browserAPI.agent.onEvent((event: AgentEvent) => {
      if (event.type === 'state') {
        setState(event.state);
        if (event.state !== 'awaiting-confirmation') setConfirm(null);
      }
      if (event.type === 'confirm') {
        setConfirm({
          description: event.description,
          domain: event.domain,
          reason: event.reason,
          actionId: event.actionId,
          allowRemember: event.allowRemember,
        });
      }
    });
  }, []);

  const paused = state === 'paused';
  const active =
    state === 'thinking' ||
    state === 'acting' ||
    state === 'awaiting-confirmation' ||
    state === 'awaiting-answer' ||
    paused;

  const host = hostFromUrl(currentUrl);
  const autonomy = AUTONOMY_LEVELS.find((l) => l.id === config.autonomy);

  // What the agent could do here right now — the honest answer, with domain
  // rules and sensitive-site handling applied.
  const siteLevel = React.useMemo(
    () => resolvePermission(config, { action: 'click', url: currentUrl }).state,
    [config, currentUrl]
  );

  const respond = async (value: boolean | 'always') => {
    setConfirm(null);
    await window.browserAPI.agent.respond(value);
    // "Always allow" writes a domain rule in main; refresh so the UI agrees.
    if (value === 'always') await load();
  };

  if (!active && !confirm) return null;

  const highImpact = confirm ? HIGH_IMPACT.has(confirm.actionId) : false;

  return (
    <>
      {/* Status strip */}
      {active && (
        <div className="pointer-events-auto absolute bottom-4 left-1/2 z-30 w-[min(560px,calc(100%-2rem))] -translate-x-1/2">
          <div className="flex items-center gap-3 rounded-lg bg-[var(--chrome)] px-3.5 py-2.5 shadow-[var(--shadow-overlay)] ring-1 ring-[var(--border)]">
            <span className="relative flex shrink-0 items-center">
              <Bot size={16} className="text-[var(--accent-fg)]" />
              {state === 'acting' && (
                <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--success)]" />
              )}
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[12.5px] font-medium text-[var(--text)]">
                  {STATE_LABELS[state]}
                </span>
                <span className="text-[11.5px] text-[var(--text-faint)]">·</span>
                <span className="text-[11.5px] text-[var(--text-muted)]">{autonomy?.label}</span>
              </div>
              <div className="mt-0.5 flex items-center gap-1.5">
                <span className="truncate text-[11.5px] text-[var(--text-faint)]">
                  {host || 'No page'}
                </span>
                <PermissionBadge state={siteLevel} />
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <button
                onClick={() => {
                  void (paused ? window.browserAPI.agent.resume() : window.browserAPI.agent.pause());
                }}
                title={paused ? 'Resume' : 'Pause after this step'}
                aria-label={paused ? 'Resume agent' : 'Pause agent'}
                className="rounded-md p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text)]"
              >
                {paused ? <Play size={14} /> : <Pause size={14} />}
              </button>
              <button
                onClick={() => void window.browserAPI.agent.stop()}
                title="Stop the agent"
                aria-label="Stop agent"
                className="flex items-center gap-1.5 rounded-md bg-[var(--danger-soft)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--danger)] transition-opacity hover:opacity-80"
              >
                <Square size={11} /> Stop
              </button>
              <button
                onClick={onOpenSettings}
                title="Agent permissions"
                aria-label="Agent permissions"
                className="rounded-md p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text)]"
              >
                <Settings2 size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Permission request */}
      {confirm && (
        <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-black/45 p-6">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label="Agent permission request"
            className="w-full max-w-md rounded-lg bg-[var(--chrome)] p-5 shadow-[var(--shadow-overlay)]"
          >
            <div className="flex items-start gap-3">
              <span
                className={`mt-0.5 shrink-0 ${highImpact ? 'text-[var(--danger)]' : 'text-[var(--accent-fg)]'}`}
              >
                {highImpact ? <ShieldAlert size={18} /> : <Bot size={18} />}
              </span>
              <div className="min-w-0">
                <h3 className="text-[15px] font-medium leading-snug text-[var(--text)]">
                  {confirm.description}
                </h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--text-muted)]">
                  On <span className="text-[var(--text)]">{confirm.domain}</span>. {confirm.reason}
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={() => void respond(false)}>
                {highImpact ? 'Cancel' : 'Deny'}
              </Button>
              {confirm.allowRemember && !highImpact && (
                <Button variant="secondary" onClick={() => void respond('always')}>
                  Always allow this website
                </Button>
              )}
              <Button
                variant={highImpact ? 'danger' : 'primary'}
                onClick={() => void respond(true)}
              >
                {highImpact ? 'Allow' : 'Allow once'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
