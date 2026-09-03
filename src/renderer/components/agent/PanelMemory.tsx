import React from 'react';
import { Brain, Check, Pencil, Trash2, X } from 'lucide-react';
import { useAgentConfig } from '../../stores/agentConfigStore';
import type { MemoryMode } from '../../../shared/agentConfig';
import { Section, Panel, Button, EmptyState, Callout, ConfirmDialog, TextInput } from './AgentUi';

const MODES: Array<{ id: MemoryMode; label: string; desc: string }> = [
  {
    id: 'enabled',
    label: 'Remember',
    desc: 'The agent keeps what it learns about your preferences between sessions.',
  },
  {
    id: 'session',
    label: 'This session only',
    desc: 'The agent remembers while the browser is open, then forgets when you quit.',
  },
  {
    id: 'disabled',
    label: 'Do not remember',
    desc: 'Nothing new is stored. Existing memories are kept until you clear them.',
  },
];

function formatDate(at: number): string {
  return new Date(at).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export const PanelMemory: React.FC = () => {
  const config = useAgentConfig((s) => s.config);
  const update = useAgentConfig((s) => s.update);
  const load = useAgentConfig((s) => s.load);

  const [editing, setEditing] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState('');
  const [pendingDelete, setPendingDelete] = React.useState<string | null>(null);
  const [clearing, setClearing] = React.useState(false);

  const entries = config.memory.entries;

  const setMode = (mode: MemoryMode) => update({ memory: { ...config.memory, mode } });

  const saveEdit = async (id: string) => {
    if (draft.trim()) {
      await window.browserAPI.agent.memory.update(id, draft.trim());
      await load();
    }
    setEditing(null);
  };

  return (
    <>
      <Section
        title="Memory"
        description="What the agent is allowed to remember about you and how you like things done."
      >
        <div className="grid gap-2.5 sm:grid-cols-3">
          {MODES.map((mode) => {
            const active = config.memory.mode === mode.id;
            return (
              <button
                key={mode.id}
                onClick={() => setMode(mode.id)}
                aria-pressed={active}
                className={`rounded-md p-3.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] ${
                  active
                    ? 'bg-[var(--accent-soft)] ring-1 ring-[var(--border-strong)]'
                    : 'bg-[var(--surface)] hover:bg-[var(--hover)]'
                }`}
              >
                <div className="text-[13.5px] font-medium text-[var(--text)]">{mode.label}</div>
                <div className="mt-1 text-[12.5px] leading-relaxed text-[var(--text-muted)]">
                  {mode.desc}
                </div>
              </button>
            );
          })}
        </div>
      </Section>

      {config.memory.mode === 'disabled' && entries.length > 0 && (
        <div className="mb-6">
          <Callout>
            Memory is off, so nothing new will be saved. The {entries.length} memories below are
            still here and still used — clear them below if you want them gone.
          </Callout>
        </div>
      )}

      <Section
        title={`Saved memories${entries.length ? ` (${entries.length})` : ''}`}
        description="Everything the agent has noted down. You can edit or remove any of it."
        action={
          entries.length > 0 ? (
            <Button variant="danger" size="sm" icon={Trash2} onClick={() => setClearing(true)}>
              Clear all
            </Button>
          ) : undefined
        }
      >
        {entries.length === 0 ? (
          <Panel>
            <EmptyState
              icon={Brain}
              title="Nothing remembered yet"
              description="As you work with the agent it will note things like which address to use or how you prefer results summarised. They will show up here."
            />
          </Panel>
        ) : (
          <div className="grid gap-2.5">
            {entries.map((entry) => (
              <div key={entry.id} className="rounded-md bg-[var(--surface)] p-3.5 shadow-sm">
                {editing === entry.id ? (
                  <div className="flex flex-col gap-2.5">
                    <TextInput
                      label="Memory"
                      value={draft}
                      onChange={setDraft}
                      onEnter={() => void saveEdit(entry.id)}
                    />
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" icon={X} onClick={() => setEditing(null)}>
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        variant="primary"
                        icon={Check}
                        onClick={() => void saveEdit(entry.id)}
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] leading-relaxed text-[var(--text)]">
                        {entry.content}
                      </p>
                      <p className="mt-1.5 text-[11.5px] text-[var(--text-faint)]">
                        Noted {formatDate(entry.createdAt)}
                        {entry.session && ' · forgotten when you quit'}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        onClick={() => {
                          setEditing(entry.id);
                          setDraft(entry.content);
                        }}
                        aria-label="Edit memory"
                        className="rounded-md p-1.5 text-[var(--text-faint)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text)]"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => setPendingDelete(entry.id)}
                        aria-label="Delete memory"
                        className="rounded-md p-1.5 text-[var(--text-faint)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--danger)]"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this memory?"
        body="The agent will forget it. This cannot be undone."
        confirmLabel="Delete"
        danger
        onConfirm={async () => {
          if (pendingDelete) {
            await window.browserAPI.agent.memory.remove(pendingDelete);
            await load();
          }
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />

      <ConfirmDialog
        open={clearing}
        title="Clear every memory?"
        body={`All ${entries.length} memories will be permanently deleted. The agent will start again from scratch.`}
        confirmLabel="Clear all"
        danger
        onConfirm={async () => {
          await window.browserAPI.agent.memory.clear();
          await load();
          setClearing(false);
        }}
        onCancel={() => setClearing(false)}
      />
    </>
  );
};
