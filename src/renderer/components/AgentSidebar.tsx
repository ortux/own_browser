import React from 'react';
import { Bot, Square, Send, Check, X, AlertCircle, Loader2 } from 'lucide-react';
import type { AgentEvent, AgentRunState, AgentStep } from '../../shared/agent';

interface AgentSidebarProps {
  open: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
}

type Entry =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'agent'; id: string; text: string }
  | { kind: 'step'; id: string; step: AgentStep }
  | { kind: 'error'; id: string; text: string };

const BUSY: ReadonlySet<AgentRunState> = new Set<AgentRunState>(['thinking', 'acting']);

export const AgentSidebar: React.FC<AgentSidebarProps> = ({ open, onClose, onOpenSettings }) => {
  const [entries, setEntries] = React.useState<Entry[]>([]);
  const [input, setInput] = React.useState('');
  const [state, setState] = React.useState<AgentRunState>('idle');
  const [confirmation, setConfirmation] = React.useState<string | null>(null);
  const [question, setQuestion] = React.useState<string | null>(null);
  const [ready, setReady] = React.useState<boolean | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // Check the agent is actually usable before offering the input.
  React.useEffect(() => {
    if (!open) return;
    window.browserAPI.agent
      .getConfig()
      .then((result) => setReady(result.config.autonomy !== 'stopped' && result.hasApiKey))
      .catch(() => setReady(false));
  }, [open]);

  React.useEffect(() => {
    return window.browserAPI.agent.onEvent((event: AgentEvent) => {
      switch (event.type) {
        case 'state':
          setState(event.state);
          if (event.state !== 'awaiting-confirmation') setConfirmation(null);
          if (event.state !== 'awaiting-answer') setQuestion(null);
          break;
        case 'step':
          setEntries((prev) => [...prev, { kind: 'step', id: event.step.id, step: event.step }]);
          break;
        case 'step-update':
          setEntries((prev) =>
            prev.map((entry) =>
              entry.kind === 'step' && entry.step.id === event.id
                ? { ...entry, step: { ...entry.step, status: event.status, error: event.error } }
                : entry
            )
          );
          break;
        case 'message':
          setEntries((prev) => [
            ...prev,
            { kind: 'agent', id: `m-${Date.now()}-${prev.length}`, text: event.text },
          ]);
          break;
        case 'confirm':
          // The full dialog lives in AgentQuickControls; the sidebar just
          // reflects that the run is waiting, so the two never disagree.
          setConfirmation(event.description);
          break;
        case 'ask':
          setQuestion(event.question);
          break;
        case 'error':
          setEntries((prev) => [
            ...prev,
            { kind: 'error', id: `e-${Date.now()}-${prev.length}`, text: event.message },
          ]);
          break;
      }
    });
  }, []);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [entries, confirmation, question]);

  const busy = BUSY.has(state);

  const submit = () => {
    const goal = input.trim();
    if (!goal) return;

    // A pending question takes priority: the text answers the agent.
    if (question) {
      setEntries((prev) => [...prev, { kind: 'user', id: `u-${Date.now()}`, text: goal }]);
      setInput('');
      setQuestion(null);
      window.browserAPI.agent.respond(goal).catch(() => {});
      return;
    }

    if (busy) return;
    setEntries((prev) => [...prev, { kind: 'user', id: `u-${Date.now()}`, text: goal }]);
    setInput('');
    window.browserAPI.agent.run(goal).catch((error: unknown) => {
      setEntries((prev) => [
        ...prev,
        {
          kind: 'error',
          id: `e-${Date.now()}`,
          text: error instanceof Error ? error.message : 'Could not start the agent.',
        },
      ]);
    });
  };

  if (!open) return null;

  return (
    <aside className="flex h-full w-[360px] shrink-0 flex-col border-l border-[var(--border)] bg-[var(--surface)]">
      <header className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
        <Bot size={16} className="text-[var(--accent)]" />
        <span className="flex-1 text-sm font-medium text-[var(--text)]">AI Agent</span>
        {busy && (
          <button
            onClick={() => window.browserAPI.agent.stop().catch(() => {})}
            className="flex items-center gap-1.5 rounded-md bg-[var(--danger-soft)] px-2.5 py-1 text-xs font-medium text-[var(--danger)] transition-colors hover:opacity-80"
            title="Stop the agent immediately"
          >
            <Square size={11} /> Stop
          </button>
        )}
        <button
          onClick={onClose}
          className="rounded-md p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text)]"
          aria-label="Close agent"
        >
          <X size={15} />
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 space-y-2.5 overflow-y-auto px-4 py-3">
        {ready === false && (
          <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3 text-xs text-[var(--text-muted)]">
            The agent needs to be enabled and given a Gemini API key.
            <button
              onClick={onOpenSettings}
              className="mt-2 block font-medium text-[var(--accent)] hover:underline"
            >
              Open agent settings
            </button>
          </div>
        )}

        {entries.length === 0 && ready !== false && (
          <p className="px-1 py-6 text-center text-xs text-[var(--text-faint)]">
            Ask the agent to do something on this page — for example, &ldquo;fill in this form with
            my details&rdquo;.
          </p>
        )}

        {entries.map((entry) => {
          if (entry.kind === 'user') {
            return (
              <div
                key={entry.id}
                className="ml-6 rounded-md bg-[var(--accent-soft)] px-3 py-2 text-xs text-[var(--text)]"
              >
                {entry.text}
              </div>
            );
          }
          if (entry.kind === 'agent') {
            return (
              <div key={entry.id} className="px-1 text-xs leading-relaxed text-[var(--text)]">
                {entry.text}
              </div>
            );
          }
          if (entry.kind === 'error') {
            return (
              <div
                key={entry.id}
                className="flex items-start gap-2 rounded-md bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger)]"
              >
                <AlertCircle size={13} className="mt-0.5 shrink-0" />
                <span>{entry.text}</span>
              </div>
            );
          }
          const { step } = entry;
          return (
            <div
              key={entry.id}
              className="flex items-start gap-2 px-1 text-xs text-[var(--text-muted)]"
            >
              <span className="mt-0.5 shrink-0">
                {step.status === 'running' && (
                  <Loader2 size={12} className="animate-spin text-[var(--accent)]" />
                )}
                {step.status === 'done' && <Check size={12} className="text-[var(--success)]" />}
                {step.status === 'failed' && <X size={12} className="text-[var(--danger)]" />}
                {step.status === 'rejected' && <X size={12} className="text-[var(--text-faint)]" />}
                {step.status === 'pending' && <span className="block h-3 w-3" />}
              </span>
              <span className={step.status === 'rejected' ? 'line-through opacity-60' : ''}>
                {step.reason || step.action.kind}
                {step.error && <span className="text-[var(--danger)]"> — {step.error}</span>}
              </span>
            </div>
          );
        })}

        {confirmation && (
          <div className="rounded-md border border-[var(--warning)]/40 bg-[var(--surface-2)] p-3">
            <p className="text-xs text-[var(--text)]">
              The agent wants to: <strong>{confirmation}</strong>
            </p>
            <p className="mt-1 text-[11px] text-[var(--text-faint)]">
              This may not be reversible.
            </p>
            <div className="mt-2.5 flex gap-2">
              <button
                onClick={() => window.browserAPI.agent.respond(true).catch(() => {})}
                className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
              >
                Allow
              </button>
              <button
                onClick={() => window.browserAPI.agent.respond(false).catch(() => {})}
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text)] transition-colors hover:bg-[var(--hover)]"
              >
                Skip
              </button>
            </div>
          </div>
        )}

        {question && (
          <div className="rounded-md border border-[var(--accent)]/40 bg-[var(--surface-2)] p-3 text-xs text-[var(--text)]">
            {question}
          </div>
        )}
      </div>

      <div className="border-t border-[var(--border)] p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={2}
            placeholder={question ? 'Answer the agent…' : 'What should the agent do?'}
            disabled={ready === false || (busy && !question)}
            className="flex-1 resize-none rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs text-[var(--text)] outline-none transition-colors placeholder:text-[var(--text-faint)] focus:border-[var(--accent)] disabled:opacity-50"
          />
          <button
            onClick={submit}
            disabled={!input.trim() || ready === false || (busy && !question)}
            className="rounded-md bg-[var(--accent)] p-2 text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            aria-label="Send"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
};
