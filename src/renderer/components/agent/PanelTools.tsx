import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useAgentConfig } from '../../stores/agentConfigStore';
import { TOOL_META, type AgentToolId } from '../../../shared/agentConfig';
import { Section, Panel, Row, Switch, Callout, ConfirmDialog } from './AgentUi';

export const PanelTools: React.FC = () => {
  const config = useAgentConfig((s) => s.config);
  const setTool = useAgentConfig((s) => s.setTool);

  // Turning a dangerous capability ON requires a deliberate confirmation.
  // Turning one OFF never does — making it harder to reduce the agent's reach
  // than to expand it would be exactly backwards.
  const [pending, setPending] = React.useState<AgentToolId | null>(null);
  const pendingMeta = TOOL_META.find((t) => t.id === pending);

  const safe = TOOL_META.filter((t) => !t.dangerous);
  const dangerous = TOOL_META.filter((t) => t.dangerous);

  return (
    <>
      <Section
        title="Everyday capabilities"
        description="What the agent can use while working. Switching one off removes the ability entirely, even if a website asks for it."
      >
        <Panel>
          {safe.map((tool) => (
            <Row key={tool.id} label={tool.label} description={tool.description}>
              <Switch
                label={tool.label}
                checked={config.tools[tool.id]}
                onChange={(next) => setTool(tool.id, next)}
              />
            </Row>
          ))}
        </Panel>
      </Section>

      <Section
        title="Powerful capabilities"
        description="These reach beyond a single web page. Each one asks you to confirm before it is switched on."
      >
        <Panel>
          {dangerous.map((tool) => {
            const enabled = config.tools[tool.id];
            return (
              <Row
                key={tool.id}
                icon={AlertTriangle}
                danger
                label={
                  <span className="flex items-center gap-2">
                    {tool.label}
                    {tool.unavailable && (
                      <span className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-[var(--text-faint)]">
                        NOT AVAILABLE
                      </span>
                    )}
                  </span>
                }
                description={
                  <>
                    {tool.description}
                    {enabled && tool.warning && (
                      <span className="mt-1 block text-[var(--danger)]">{tool.warning}</span>
                    )}
                  </>
                }
              >
                <Switch
                  label={tool.label}
                  checked={enabled}
                  disabled={tool.unavailable}
                  onChange={(next) => {
                    if (next) setPending(tool.id);
                    else void setTool(tool.id, false);
                  }}
                />
              </Row>
            );
          })}
        </Panel>
      </Section>

      <Callout tone="warning">
        The agent never has access to your saved passwords, whichever capabilities are switched on.
        It can type into a login form, but it cannot read your password list.
      </Callout>

      <ConfirmDialog
        open={pending !== null}
        title={`Enable ${pendingMeta?.label.toLowerCase()}?`}
        body={pendingMeta?.warning}
        confirmLabel="Enable"
        danger
        onConfirm={() => {
          if (pending) void setTool(pending, true);
          setPending(null);
        }}
        onCancel={() => setPending(null)}
      />
    </>
  );
};
