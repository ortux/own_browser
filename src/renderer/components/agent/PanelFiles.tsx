import React from 'react';
import { FolderOpen, FolderPlus, Trash2 } from 'lucide-react';
import { useAgentConfig } from '../../stores/agentConfigStore';
import type { FileAccessMode, FolderPermission } from '../../../shared/agentConfig';
import { Section, Panel, Row, Switch, Button, EmptyState, Callout, ConfirmDialog } from './AgentUi';

const MODES: Array<{ id: FileAccessMode; label: string; desc: string }> = [
  {
    id: 'none',
    label: 'No file access',
    desc: 'The agent cannot touch anything on your computer. Safest, and the default.',
  },
  {
    id: 'ask',
    label: 'Ask each time',
    desc: 'The agent asks permission for each file it wants to open.',
  },
  {
    id: 'folders',
    label: 'Allow chosen folders',
    desc: 'The agent may work inside folders you pick below, and nowhere else.',
  },
];

const RIGHTS: Array<{ key: keyof Omit<FolderPermission, 'path'>; label: string; destructive?: boolean }> = [
  { key: 'read', label: 'READ' },
  { key: 'write', label: 'WRITE' },
  { key: 'upload', label: 'UPLOAD' },
  { key: 'delete', label: 'DELETE', destructive: true },
];

export const PanelFiles: React.FC = () => {
  const config = useAgentConfig((s) => s.config);
  const update = useAgentConfig((s) => s.update);

  const [pendingDelete, setPendingDelete] = React.useState<string | null>(null);
  const [pendingRight, setPendingRight] = React.useState<{ path: string } | null>(null);
  const [adding, setAdding] = React.useState(false);

  const setMode = (mode: FileAccessMode) => update({ files: { ...config.files, mode } });

  const addFolder = async () => {
    setAdding(true);
    try {
      const picked = await window.browserAPI.agent.files.pickFolder();
      if (!picked) return;
      if (config.files.folders.some((f) => f.path === picked)) return;
      await update({
        files: {
          ...config.files,
          // New folders start read-only: the least surprising default, and the
          // one that cannot destroy anything if the agent misbehaves.
          folders: [
            ...config.files.folders,
            { path: picked, read: true, write: false, upload: false, delete: false },
          ],
        },
      });
    } finally {
      setAdding(false);
    }
  };

  const setRight = (path: string, key: keyof Omit<FolderPermission, 'path'>, value: boolean) =>
    update({
      files: {
        ...config.files,
        folders: config.files.folders.map((f) => (f.path === path ? { ...f, [key]: value } : f)),
      },
    });

  const removeFolder = (path: string) =>
    update({
      files: { ...config.files, folders: config.files.folders.filter((f) => f.path !== path) },
    });

  return (
    <>
      <Section
        title="File access"
        description="Whether the agent may read or change files on your computer."
      >
        <div className="grid gap-2.5">
          {MODES.map((mode) => {
            const active = config.files.mode === mode.id;
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

      {config.files.mode === 'folders' && (
        <Section
          title="Permitted folders"
          description="New folders start as read-only. Grant more only where you need it."
          action={
            <Button icon={FolderPlus} onClick={addFolder} disabled={adding}>
              {adding ? 'Choosing…' : 'Add folder'}
            </Button>
          }
        >
          {config.files.folders.length === 0 ? (
            <Panel>
              <EmptyState
                icon={FolderOpen}
                title="No folders yet"
                description="Until you add one, the agent has no access to any file on your computer."
                action={
                  <Button icon={FolderPlus} onClick={addFolder}>
                    Add folder
                  </Button>
                }
              />
            </Panel>
          ) : (
            <Panel>
              {config.files.folders.map((folder) => (
                <div key={folder.path} className="border-b border-[var(--border)] p-4 last:border-b-0">
                  <div className="flex items-center gap-3">
                    <FolderOpen size={15} className="shrink-0 text-[var(--text-faint)]" />
                    <span
                      className="min-w-0 flex-1 truncate font-[family-name:var(--font-mono)] text-[12.5px] text-[var(--text)]"
                      title={folder.path}
                    >
                      {folder.path}
                    </span>
                    <button
                      onClick={() => setPendingDelete(folder.path)}
                      aria-label={`Remove ${folder.path}`}
                      className="rounded-md p-1.5 text-[var(--text-faint)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--danger)]"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2 pl-[27px]">
                    {RIGHTS.map((right) => {
                      const on = folder[right.key];
                      return (
                        <button
                          key={right.key}
                          aria-pressed={on}
                          onClick={() => {
                            // Deleting files is irreversible, so granting it is
                            // the one permission that needs a second thought.
                            if (right.destructive && !on) {
                              setPendingRight({ path: folder.path });
                            } else {
                              void setRight(folder.path, right.key, !on);
                            }
                          }}
                          className={`rounded px-2 py-1 text-[10.5px] font-semibold tracking-[0.06em] transition-colors ${
                            on
                              ? right.destructive
                                ? 'bg-[var(--danger-soft)] text-[var(--danger)]'
                                : 'bg-[color-mix(in_srgb,var(--success)_16%,transparent)] text-[var(--success)]'
                              : 'bg-[var(--surface-2)] text-[var(--text-faint)] hover:text-[var(--text-muted)]'
                          }`}
                        >
                          {right.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </Panel>
          )}
        </Section>
      )}

      <Section title="Safety">
        <Panel>
          <Row
            label="Always confirm before deleting a file"
            description="Even in a folder where deleting is allowed, the agent asks first. This cannot be switched off."
          >
            <Switch label="Always confirm before deleting a file" checked disabled onChange={() => {}} />
          </Row>
        </Panel>
      </Section>

      <Callout tone="warning">
        Folder access applies to everything inside, including subfolders. Pick the narrowest folder
        that gets the job done.
      </Callout>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Remove this folder?"
        body={
          <>
            The agent will lose all access to <strong>{pendingDelete}</strong>. Nothing on disk is
            changed.
          </>
        }
        confirmLabel="Remove"
        danger
        onConfirm={() => {
          if (pendingDelete) void removeFolder(pendingDelete);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />

      <ConfirmDialog
        open={pendingRight !== null}
        title="Allow the agent to delete files here?"
        body="Deleted files may not be recoverable. The agent will still ask before each deletion, but this lets it request one at all."
        confirmLabel="Allow deleting"
        danger
        onConfirm={() => {
          if (pendingRight) void setRight(pendingRight.path, 'delete', true);
          setPendingRight(null);
        }}
        onCancel={() => setPendingRight(null)}
      />
    </>
  );
};
