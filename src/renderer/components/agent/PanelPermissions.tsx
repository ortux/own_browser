import React from 'react';
import { Globe, Wrench } from 'lucide-react';
import { useAgentConfig } from '../../stores/agentConfigStore';
import {
  ACTION_META,
  TOOL_META,
  resolvePermission,
  hostFromUrl,
  type PermissionState,
} from '../../../shared/agentConfig';
import { Section, Panel, Row, PermissionBadge, TextInput, Callout, EmptyState } from './AgentUi';

/**
 * The permissions overview.
 *
 * Autonomy is where you *change* things; this is where you check what the
 * combination actually adds up to. Those are different jobs: with an autonomy
 * level, per-action settings, domain rules and sensitive-site handling all
 * interacting, "what would happen on this site" is genuinely hard to work out
 * by reading the individual screens.
 */
export const PanelPermissions: React.FC = () => {
  const config = useAgentConfig((s) => s.config);
  const [probe, setProbe] = React.useState('');

  const host = probe.trim() ? hostFromUrl(probe.includes('://') ? probe : `https://${probe}`) : '';

  const grouped = React.useMemo(() => {
    const result: Record<PermissionState, string[]> = { allow: [], ask: [], never: [] };
    for (const action of ACTION_META) {
      const state = resolvePermission(config, {
        action: action.id,
        url: host ? `https://${host}` : undefined,
      }).state;
      result[state].push(action.label);
    }
    return result;
  }, [config, host]);

  const enabledTools = TOOL_META.filter((t) => config.tools[t.id] && !t.unavailable);
  const disabledTools = TOOL_META.filter((t) => !config.tools[t.id] || t.unavailable);

  return (
    <>
      <Section
        title="Check a website"
        description="Type any website to see exactly what the agent would be allowed to do there, with all your rules applied together."
      >
        <Panel>
          <div className="p-4">
            <TextInput
              label="Website to check"
              value={probe}
              onChange={setProbe}
              placeholder="example.com"
            />
          </div>

          {host && (
            <div className="border-t border-[var(--border)]">
              {(['allow', 'ask', 'never'] as const).map((state) => {
                const items = grouped[state];
                if (items.length === 0) return null;
                return (
                  <div key={state} className="flex gap-3 border-b border-[var(--border)] px-4 py-3 last:border-b-0">
                    <div className="w-16 shrink-0 pt-0.5">
                      <PermissionBadge state={state} />
                    </div>
                    <p className="text-[12.5px] leading-relaxed text-[var(--text-muted)]">
                      {items.join(', ')}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {probe.trim() && !host && (
            <div className="border-t border-[var(--border)] px-4 py-3">
              <p className="text-[12.5px] text-[var(--text-faint)]">
                That does not look like a website address.
              </p>
            </div>
          )}
        </Panel>
      </Section>

      <Section
        title="Actions at a glance"
        description="What the agent may do on an ordinary website, with no special rule of its own."
      >
        <Panel>
          {ACTION_META.map((action) => {
            const effective = resolvePermission(config, { action: action.id }).state;
            return (
              <Row key={action.id} label={action.label} description={action.description}>
                <PermissionBadge state={effective} />
              </Row>
            );
          })}
        </Panel>
      </Section>

      <Section title="Tools in use" description="Capabilities the agent currently has available.">
        <Panel>
          {enabledTools.length === 0 ? (
            <EmptyState
              icon={Wrench}
              title="No tools enabled"
              description="The agent has no capabilities switched on, so it cannot do anything. Turn some on under Tools."
            />
          ) : (
            <div className="flex flex-wrap gap-1.5 p-4">
              {enabledTools.map((tool) => (
                <span
                  key={tool.id}
                  className={`rounded px-2 py-1 text-[11.5px] ${
                    tool.dangerous
                      ? 'bg-[var(--danger-soft)] text-[var(--danger)]'
                      : 'bg-[var(--surface-2)] text-[var(--text-muted)]'
                  }`}
                >
                  {tool.label}
                </span>
              ))}
            </div>
          )}
          {disabledTools.length > 0 && (
            <div className="border-t border-[var(--border)] px-4 py-3">
              <p className="text-[11.5px] text-[var(--text-faint)]">
                Switched off: {disabledTools.map((t) => t.label).join(', ')}
              </p>
            </div>
          )}
        </Panel>
      </Section>

      <Section
        title="Website rules"
        description="Sites you have given specific treatment."
      >
        {config.domains.length === 0 ? (
          <Panel>
            <EmptyState
              icon={Globe}
              title="No website rules"
              description="Every site is treated the same. Add rules under Websites to trust or block specific ones."
            />
          </Panel>
        ) : (
          <Panel>
            {config.domains.map((rule) => (
              <div
                key={rule.pattern}
                className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-2.5 last:border-b-0"
              >
                <Globe size={14} className="shrink-0 text-[var(--text-faint)]" />
                <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--text)]">
                  {rule.pattern}
                </span>
                <PermissionBadge state={rule.state} />
              </div>
            ))}
          </Panel>
        )}
      </Section>

      <Callout>
        This page is read-only. To change anything, use Autonomy for actions, Tools for
        capabilities, or Websites for individual sites.
      </Callout>
    </>
  );
};
