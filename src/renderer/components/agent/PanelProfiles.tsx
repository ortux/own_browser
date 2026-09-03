import React from 'react';
import { Check, Copy, Pencil, Star, Trash2, UserSquare2 } from 'lucide-react';
import { useAgentConfig, scopeFromConfig } from '../../stores/agentConfigStore';
import {
  AUTONOMY_LEVELS,
  validateProfileName,
  type AgentProfile,
} from '../../../shared/agentConfig';
import { Section, Panel, Button, TextInput, Callout, ConfirmDialog } from './AgentUi';

export const PanelProfiles: React.FC = () => {
  const config = useAgentConfig((s) => s.config);
  const applyProfile = useAgentConfig((s) => s.applyProfile);
  const saveProfile = useAgentConfig((s) => s.saveProfile);
  const deleteProfile = useAgentConfig((s) => s.deleteProfile);

  const [renaming, setRenaming] = React.useState<string | null>(null);
  const [draftName, setDraftName] = React.useState('');
  const [nameError, setNameError] = React.useState('');
  const [pendingDelete, setPendingDelete] = React.useState<AgentProfile | null>(null);
  const [pendingSwitch, setPendingSwitch] = React.useState<AgentProfile | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [newName, setNewName] = React.useState('');

  const commitRename = async (profile: AgentProfile) => {
    const check = validateProfileName(draftName, config.profiles, profile.id);
    if (!check.ok) {
      setNameError(check.error ?? 'Invalid name.');
      return;
    }
    await saveProfile({ ...profile, name: draftName.trim() });
    setRenaming(null);
    setNameError('');
  };

  const duplicate = async (profile: AgentProfile) => {
    let name = `${profile.name} copy`;
    let n = 2;
    while (config.profiles.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      name = `${profile.name} copy ${n++}`;
    }
    await saveProfile({
      ...profile,
      id: `profile-${Date.now()}`,
      name,
      builtIn: false,
      description: profile.description,
    });
  };

  const createFromCurrent = async () => {
    const check = validateProfileName(newName, config.profiles);
    if (!check.ok) {
      setNameError(check.error ?? 'Invalid name.');
      return;
    }
    await saveProfile({
      id: `profile-${Date.now()}`,
      name: newName.trim(),
      description: 'Your own saved setup.',
      ...scopeFromConfig(config),
    });
    setNewName('');
    setCreating(false);
    setNameError('');
  };

  return (
    <>
      <Section
        title="Profiles"
        description="A profile is a whole set of permissions saved together. Switching profile swaps your autonomy level, action permissions, tools, website rules, and security limits all at once."
        action={
          !creating ? (
            <Button icon={Star} onClick={() => setCreating(true)}>
              Save current as profile
            </Button>
          ) : undefined
        }
      >
        {creating && (
          <Panel className="mb-3">
            <div className="flex flex-col gap-3 p-4">
              <p className="text-[12.5px] text-[var(--text-muted)]">
                This saves everything as it is set right now under a new name.
              </p>
              <TextInput
                label="Profile name"
                value={newName}
                onChange={(v) => {
                  setNewName(v);
                  setNameError('');
                }}
                onEnter={createFromCurrent}
                placeholder="My setup"
                error={nameError}
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setCreating(false);
                    setNewName('');
                    setNameError('');
                  }}
                >
                  Cancel
                </Button>
                <Button variant="primary" onClick={createFromCurrent}>
                  Save profile
                </Button>
              </div>
            </div>
          </Panel>
        )}

        <div className="grid gap-2.5">
          {config.profiles.map((profile) => {
            const active = config.activeProfileId === profile.id;
            const autonomy = AUTONOMY_LEVELS.find((l) => l.id === profile.autonomy);
            const toolCount = Object.values(profile.tools).filter(Boolean).length;
            const blocked = Object.values(profile.actions).filter((s) => s === 'never').length;

            return (
              <div
                key={profile.id}
                className={`rounded-md p-4 shadow-sm transition-colors ${
                  active
                    ? 'bg-[var(--accent-soft)] ring-1 ring-[var(--border-strong)]'
                    : 'bg-[var(--surface)]'
                }`}
              >
                <div className="flex items-start gap-3">
                  <UserSquare2
                    size={17}
                    className={`mt-0.5 shrink-0 ${active ? 'text-[var(--text)]' : 'text-[var(--text-faint)]'}`}
                  />

                  <div className="min-w-0 flex-1">
                    {renaming === profile.id ? (
                      <div className="flex flex-col gap-2">
                        <TextInput
                          label="Profile name"
                          value={draftName}
                          onChange={(v) => {
                            setDraftName(v);
                            setNameError('');
                          }}
                          onEnter={() => void commitRename(profile)}
                          error={nameError}
                        />
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="ghost" onClick={() => setRenaming(null)}>
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => void commitRename(profile)}
                          >
                            Save
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[14px] font-medium text-[var(--text)]">
                            {profile.name}
                          </span>
                          {active && (
                            <span className="rounded bg-[color-mix(in_srgb,var(--success)_16%,transparent)] px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.06em] text-[var(--success)]">
                              IN USE
                            </span>
                          )}
                          {profile.builtIn && (
                            <span className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.06em] text-[var(--text-faint)]">
                              BUILT IN
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--text-muted)]">
                          {profile.description}
                        </p>
                        <p className="mt-2 text-[11.5px] text-[var(--text-faint)]">
                          {autonomy?.label} · {toolCount} tools on · {blocked} actions blocked ·{' '}
                          {profile.domains.length} website rules
                        </p>
                      </>
                    )}
                  </div>

                  {renaming !== profile.id && (
                    <div className="flex shrink-0 items-center gap-1">
                      {!active && (
                        <Button size="sm" icon={Check} onClick={() => setPendingSwitch(profile)}>
                          Use
                        </Button>
                      )}
                      <button
                        onClick={() => void duplicate(profile)}
                        aria-label={`Duplicate ${profile.name}`}
                        className="rounded-md p-1.5 text-[var(--text-faint)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text)]"
                      >
                        <Copy size={14} />
                      </button>
                      {!profile.builtIn && (
                        <>
                          <button
                            onClick={() => {
                              setRenaming(profile.id);
                              setDraftName(profile.name);
                              setNameError('');
                            }}
                            aria-label={`Rename ${profile.name}`}
                            className="rounded-md p-1.5 text-[var(--text-faint)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text)]"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => setPendingDelete(profile)}
                            aria-label={`Delete ${profile.name}`}
                            className="rounded-md p-1.5 text-[var(--text-faint)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--danger)]"
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      <Callout>
        Built-in profiles cannot be renamed or deleted, but you can duplicate one and change the
        copy however you like. No profile can allow purchases automatically.
      </Callout>

      <ConfirmDialog
        open={pendingSwitch !== null}
        title={`Switch to the ${pendingSwitch?.name} profile?`}
        body="This replaces your current autonomy level, action permissions, tool settings, website rules, and security limits. Save your current setup as a profile first if you want to keep it."
        confirmLabel="Switch profile"
        onConfirm={() => {
          if (pendingSwitch) void applyProfile(pendingSwitch.id);
          setPendingSwitch(null);
        }}
        onCancel={() => setPendingSwitch(null)}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Delete the ${pendingDelete?.name} profile?`}
        body="The profile will be removed. Your current settings stay as they are."
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          if (pendingDelete) void deleteProfile(pendingDelete.id);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
};
