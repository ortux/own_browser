import React from 'react';
import { ScrollText, Trash2 } from 'lucide-react';
import { useAgentConfig } from '../../stores/agentConfigStore';
import type { ActivityResult } from '../../../shared/agentConfig';
import { Section, Panel, Button, SearchField, Select, EmptyState, ConfirmDialog } from './AgentUi';

const RESULT_STYLES: Record<ActivityResult, { label: string; className: string }> = {
  ok: { label: 'Done', className: 'text-[var(--success)]' },
  failed: { label: "Didn't work", className: 'text-[var(--danger)]' },
  blocked: { label: 'Blocked', className: 'text-[var(--danger)]' },
  asked: { label: 'Asked you', className: 'text-[var(--warning)]' },
  denied: { label: 'You said no', className: 'text-[var(--text-faint)]' },
};

function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function formatDay(at: number): string {
  const date = new Date(at);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
}

export const PanelActivity: React.FC = () => {
  const config = useAgentConfig((s) => s.config);
  const load = useAgentConfig((s) => s.load);

  const [search, setSearch] = React.useState('');
  const [domain, setDomain] = React.useState('all');
  const [result, setResult] = React.useState('all');
  const [clearing, setClearing] = React.useState(false);

  const entries = config.activity;

  const domains = React.useMemo(
    () => Array.from(new Set(entries.map((e) => e.domain))).sort(),
    [entries]
  );

  const filtered = entries.filter((entry) => {
    if (domain !== 'all' && entry.domain !== domain) return false;
    if (result !== 'all' && entry.result !== result) return false;
    if (search.trim()) {
      const needle = search.trim().toLowerCase();
      return (
        entry.action.toLowerCase().includes(needle) ||
        entry.domain.toLowerCase().includes(needle) ||
        (entry.detail ?? '').toLowerCase().includes(needle)
      );
    }
    return true;
  });

  // Group by day so a long log stays readable.
  const grouped = React.useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const entry of filtered) {
      const key = formatDay(entry.at);
      const list = map.get(key);
      if (list) list.push(entry);
      else map.set(key, [entry]);
    }
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <>
      <Section
        title="Activity"
        description="Everything the agent has done, most recent first. Worth a look after it has been working on its own."
        action={
          entries.length > 0 ? (
            <Button variant="danger" size="sm" icon={Trash2} onClick={() => setClearing(true)}>
              Clear
            </Button>
          ) : undefined
        }
      >
        {entries.length > 0 && (
          <div className="mb-3 flex flex-col gap-2 sm:flex-row">
            <div className="flex-1">
              <SearchField value={search} onChange={setSearch} placeholder="Search activity" />
            </div>
            <Select
              label="Filter by website"
              className="sm:w-48"
              value={domain}
              onChange={setDomain}
              options={[
                { id: 'all', label: 'All websites' },
                ...domains.map((d) => ({ id: d, label: d })),
              ]}
            />
            <Select
              label="Filter by result"
              className="sm:w-40"
              value={result}
              onChange={setResult}
              options={[
                { id: 'all', label: 'All results' },
                { id: 'ok', label: 'Done' },
                { id: 'asked', label: 'Asked you' },
                { id: 'denied', label: 'You said no' },
                { id: 'blocked', label: 'Blocked' },
                { id: 'failed', label: "Didn't work" },
              ]}
            />
          </div>
        )}

        {entries.length === 0 ? (
          <Panel>
            <EmptyState
              icon={ScrollText}
              title="Nothing yet"
              description="Once the agent starts working, every step it takes will be listed here — what it did, where, and whether it needed your permission."
            />
          </Panel>
        ) : filtered.length === 0 ? (
          <Panel>
            <EmptyState
              icon={ScrollText}
              title="No matching activity"
              description="Try a different search or filter."
              action={
                <Button
                  size="sm"
                  onClick={() => {
                    setSearch('');
                    setDomain('all');
                    setResult('all');
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          </Panel>
        ) : (
          <div className="grid gap-4">
            {grouped.map(([day, items]) => (
              <div key={day}>
                <h3 className="mb-2 px-1 text-[11.5px] font-medium tracking-[0.06em] text-[var(--text-faint)]">
                  {day.toUpperCase()}
                </h3>
                <Panel>
                  {items.map((entry) => {
                    const style = RESULT_STYLES[entry.result];
                    return (
                      <div
                        key={entry.id}
                        className="flex items-start gap-3 border-b border-[var(--border)] px-4 py-2.5 last:border-b-0"
                      >
                        <span className="w-11 shrink-0 pt-0.5 text-[11.5px] tabular-nums text-[var(--text-faint)]">
                          {formatTime(entry.at)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] leading-snug text-[var(--text)]">
                            {entry.action}
                          </p>
                          <p className="mt-0.5 text-[11.5px] text-[var(--text-faint)]">
                            {entry.domain}
                            {entry.detail && ` · ${entry.detail}`}
                          </p>
                        </div>
                        <span className={`shrink-0 pt-0.5 text-[11.5px] ${style.className}`}>
                          {style.label}
                        </span>
                      </div>
                    );
                  })}
                </Panel>
              </div>
            ))}
          </div>
        )}
      </Section>

      <ConfirmDialog
        open={clearing}
        title="Clear the activity log?"
        body="The whole history will be deleted. This does not change any of your permissions."
        confirmLabel="Clear log"
        danger
        onConfirm={async () => {
          await window.browserAPI.agent.activity.clear();
          await load();
          setClearing(false);
        }}
        onCancel={() => setClearing(false)}
      />
    </>
  );
};
