import React from 'react';
import { Globe, Plus, Trash2 } from 'lucide-react';
import { useAgentConfig } from '../../stores/agentConfigStore';
import {
  validateDomainPattern,
  sensitiveCategoryFor,
  type PermissionState,
} from '../../../shared/agentConfig';
import {
  Section,
  Panel,
  Button,
  TextInput,
  SearchField,
  PermissionPicker,
  EmptyState,
  Callout,
  ConfirmDialog,
} from './AgentUi';

const GROUPS: Array<{ state: PermissionState; title: string; description: string }> = [
  {
    state: 'allow',
    title: 'Always allowed',
    description: 'The agent works freely here, without checking in.',
  },
  {
    state: 'ask',
    title: 'Ask before acting',
    description: 'The agent checks with you before it does anything on these sites.',
  },
  {
    state: 'never',
    title: 'Blocked',
    description: 'The agent will not act on these sites at all.',
  },
];

export const PanelWebsites: React.FC = () => {
  const config = useAgentConfig((s) => s.config);
  const addDomain = useAgentConfig((s) => s.addDomain);
  const updateDomain = useAgentConfig((s) => s.updateDomain);
  const removeDomain = useAgentConfig((s) => s.removeDomain);

  const [input, setInput] = React.useState('');
  const [state, setState] = React.useState<PermissionState>('allow');
  const [error, setError] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [pendingRemove, setPendingRemove] = React.useState<string | null>(null);

  const submit = async () => {
    const result = validateDomainPattern(input);
    if (!result.ok || !result.value) {
      setError(result.error ?? 'That is not a valid website address.');
      return;
    }
    if (config.domains.some((d) => d.pattern === result.value)) {
      setError('That website already has a rule.');
      return;
    }
    await addDomain({ pattern: result.value, state });
    setInput('');
    setError('');
  };

  const filtered = config.domains.filter((d) =>
    d.pattern.toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <>
      <Section
        title="Add a website"
        description="Use a plain address like example.com, or *.example.com to cover every subdomain as well."
      >
        <Panel>
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
            <div className="flex-1">
              <TextInput
                label="Website address"
                value={input}
                onChange={(v) => {
                  setInput(v);
                  if (error) setError('');
                }}
                onEnter={submit}
                placeholder="example.com"
                error={error}
              />
            </div>
            <PermissionPicker label="Permission for the new website" value={state} onChange={setState} />
            <Button variant="primary" icon={Plus} onClick={submit} disabled={!input.trim()}>
              Add
            </Button>
          </div>
        </Panel>
      </Section>

      {config.domains.length > 3 && (
        <div className="mb-5">
          <SearchField value={search} onChange={setSearch} placeholder="Search websites" />
        </div>
      )}

      {config.domains.length === 0 ? (
        <Panel>
          <EmptyState
            icon={Globe}
            title="No website rules yet"
            description="Without specific rules, the agent follows your general permissions on every site. Add a site above to treat it differently."
          />
        </Panel>
      ) : (
        GROUPS.map((group) => {
          const rules = filtered.filter((d) => d.state === group.state);
          if (search && rules.length === 0) return null;

          return (
            <Section key={group.state} title={group.title} description={group.description}>
              {rules.length === 0 ? (
                <p className="px-1 text-[12.5px] text-[var(--text-faint)]">
                  Nothing here yet.
                </p>
              ) : (
                <Panel>
                  {rules.map((rule) => {
                    const sensitive = sensitiveCategoryFor(rule.pattern.replace(/^\*\./, ''));
                    return (
                      <div
                        key={rule.pattern}
                        className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3 last:border-b-0"
                      >
                        <Globe size={15} className="shrink-0 text-[var(--text-faint)]" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13.5px] text-[var(--text)]">
                            {rule.pattern}
                          </div>
                          {sensitive && (
                            <div className="mt-0.5 text-[12px] text-[var(--text-muted)]">
                              Recognised as a {sensitive.label.toLowerCase()} site — it will still
                              ask first unless you turn that off in Login &amp; Sessions.
                            </div>
                          )}
                        </div>
                        <PermissionPicker
                          label={`Permission for ${rule.pattern}`}
                          value={rule.state}
                          onChange={(next) => updateDomain(rule.pattern, { state: next })}
                        />
                        <button
                          onClick={() => setPendingRemove(rule.pattern)}
                          aria-label={`Remove ${rule.pattern}`}
                          className="rounded-md p-1.5 text-[var(--text-faint)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--danger)]"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    );
                  })}
                </Panel>
              )}
            </Section>
          );
        })
      )}

      {search && filtered.length === 0 && (
        <Panel>
          <EmptyState
            icon={Globe}
            title="No matches"
            description={`No website rule matches "${search}".`}
          />
        </Panel>
      )}

      <Callout>
        When two rules could apply, the more specific one wins — so a rule for mail.example.com
        overrides one for *.example.com.
      </Callout>

      <ConfirmDialog
        open={pendingRemove !== null}
        title="Remove this website rule?"
        body={
          <>
            <strong>{pendingRemove}</strong> will go back to following your general permissions.
          </>
        }
        confirmLabel="Remove"
        danger
        onConfirm={() => {
          if (pendingRemove) void removeDomain(pendingRemove);
          setPendingRemove(null);
        }}
        onCancel={() => setPendingRemove(null)}
      />
    </>
  );
};
