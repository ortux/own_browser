import React from 'react';
import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useAgentConfig } from '../../stores/agentConfigStore';
import type { AdvancedConfig } from '../../../shared/agentConfig';
import {
  Section,
  Panel,
  Row,
  Switch,
  NumberField,
  TextInput,
  Button,
  Disclosure,
  Callout,
  EmptyState,
  ConfirmDialog,
} from './AgentUi';

export const PanelAdvanced: React.FC = () => {
  const config = useAgentConfig((s) => s.config);
  const update = useAgentConfig((s) => s.update);
  const reset = useAgentConfig((s) => s.reset);

  const [instructions, setInstructions] = React.useState(config.advanced.systemInstructions);
  const [savedNote, setSavedNote] = React.useState('');
  const [mcpName, setMcpName] = React.useState('');
  const [mcpUrl, setMcpUrl] = React.useState('');
  const [mcpError, setMcpError] = React.useState('');
  const [resetting, setResetting] = React.useState(false);

  // Keep the textarea in step if the config changes elsewhere (profile switch).
  React.useEffect(() => {
    setInstructions(config.advanced.systemInstructions);
  }, [config.advanced.systemInstructions]);

  const patch = (next: Partial<AdvancedConfig>) =>
    update({ advanced: { ...config.advanced, ...next } });

  const saveInstructions = async () => {
    await patch({ systemInstructions: instructions.slice(0, 4_000) });
    setSavedNote('Saved.');
    setTimeout(() => setSavedNote(''), 2_000);
  };

  const addMcp = async () => {
    if (!mcpName.trim()) return setMcpError('Give the server a name.');
    let parsed: URL;
    try {
      parsed = new URL(mcpUrl.trim());
    } catch {
      return setMcpError('That is not a valid address.');
    }
    if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost') {
      // Plain http to a remote host would send tool traffic in the clear.
      return setMcpError('Use https, or localhost for a server on this machine.');
    }
    await patch({
      mcpServers: [
        ...config.advanced.mcpServers,
        { id: `mcp-${Date.now()}`, name: mcpName.trim(), url: parsed.toString(), enabled: true },
      ],
    });
    setMcpName('');
    setMcpUrl('');
    setMcpError('');
  };

  return (
    <>
      <Section
        title="Custom instructions"
        description="Extra guidance added to everything the agent does — house style, things to avoid, context about you."
      >
        <Panel>
          <div className="p-4">
            <textarea
              aria-label="Custom system instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={5}
              maxLength={4_000}
              placeholder="Always prefer official documentation over blog posts. Never accept cookie banners on my behalf."
              className="w-full resize-y rounded-md bg-[var(--surface-2)] px-3 py-2.5 text-[13px] leading-relaxed text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:ring-2 focus:ring-[var(--accent)]"
            />
            <div className="mt-2.5 flex items-center justify-between">
              <span className="text-[11.5px] text-[var(--text-faint)]">
                {instructions.length} / 4000
                {savedNote && <span className="ml-2 text-[var(--success)]">{savedNote}</span>}
              </span>
              <Button
                variant="primary"
                size="sm"
                onClick={saveInstructions}
                disabled={instructions === config.advanced.systemInstructions}
              >
                Save instructions
              </Button>
            </div>
          </div>
        </Panel>
      </Section>

      <Section
        title="Performance"
        description="How hard the agent works before it gives up."
      >
        <Panel>
          <Row
            label="Maximum steps"
            description="One step is one action. The lower of this and the Security limit applies."
          >
            <NumberField
              label="Maximum steps"
              value={config.advanced.maxSteps}
              min={1}
              max={500}
              suffix="steps"
              onChange={(v) => patch({ maxSteps: v })}
            />
          </Row>
          <Row label="Request timeout" description="How long to wait for the AI model to reply.">
            <NumberField
              label="Request timeout"
              value={config.advanced.requestTimeoutSeconds}
              min={5}
              max={600}
              suffix="seconds"
              onChange={(v) => patch({ requestTimeoutSeconds: v })}
            />
          </Row>
          <Row
            label="Maximum concurrent tabs"
            description="How many tabs the agent may work in at the same time."
          >
            <NumberField
              label="Maximum concurrent tabs"
              value={config.advanced.maxConcurrentTabs}
              min={1}
              max={50}
              suffix="tabs"
              onChange={(v) => patch({ maxConcurrentTabs: v })}
            />
          </Row>
        </Panel>
      </Section>

      <div className="mb-9 grid gap-2.5">
        <Disclosure
          title="Developer options"
          description="Diagnostics and internals. Not needed for normal use."
        >
          <Panel>
            <Row
              label="Debug logging"
              description="Write detailed logs of the agent's reasoning to the console."
            >
              <Switch
                label="Debug logging"
                checked={config.advanced.debugLogging}
                onChange={(v) => patch({ debugLogging: v })}
              />
            </Row>
            <Row
              label="Developer mode"
              description="Show raw model output and the exact action the agent chose at each step."
            >
              <Switch
                label="Developer mode"
                checked={config.advanced.developerMode}
                onChange={(v) => patch({ developerMode: v })}
              />
            </Row>
          </Panel>
        </Disclosure>

        <Disclosure
          title="MCP integrations"
          description="Connect external tool servers that speak the Model Context Protocol."
        >
          <div className="p-4">
            {config.advanced.mcpServers.length === 0 ? (
              <EmptyState
                icon={Plus}
                title="No servers connected"
                description="MCP servers give the agent extra tools beyond the browser. Add one below if you run one."
              />
            ) : (
              <div className="mb-3 grid gap-2">
                {config.advanced.mcpServers.map((server) => (
                  <div
                    key={server.id}
                    className="flex items-center gap-3 rounded-md bg-[var(--surface-2)] px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] text-[var(--text)]">{server.name}</div>
                      <div className="truncate font-[family-name:var(--font-mono)] text-[11.5px] text-[var(--text-faint)]">
                        {server.url}
                      </div>
                    </div>
                    <Switch
                      label={`Enable ${server.name}`}
                      checked={server.enabled}
                      onChange={(v) =>
                        patch({
                          mcpServers: config.advanced.mcpServers.map((s) =>
                            s.id === server.id ? { ...s, enabled: v } : s
                          ),
                        })
                      }
                    />
                    <button
                      onClick={() =>
                        patch({
                          mcpServers: config.advanced.mcpServers.filter((s) => s.id !== server.id),
                        })
                      }
                      aria-label={`Remove ${server.name}`}
                      className="rounded-md p-1.5 text-[var(--text-faint)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--danger)]"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-col gap-2 sm:flex-row">
              <TextInput
                className="sm:w-44"
                label="Server name"
                value={mcpName}
                onChange={(v) => {
                  setMcpName(v);
                  setMcpError('');
                }}
                placeholder="My tools"
              />
              <TextInput
                className="flex-1"
                label="Server address"
                value={mcpUrl}
                onChange={(v) => {
                  setMcpUrl(v);
                  setMcpError('');
                }}
                onEnter={addMcp}
                placeholder="https://example.com/mcp"
                error={mcpError}
                monospace
              />
              <Button icon={Plus} onClick={addMcp} disabled={!mcpName.trim() || !mcpUrl.trim()}>
                Add
              </Button>
            </div>
          </div>
        </Disclosure>
      </div>

      <Section title="Reset">
        <Panel>
          <Row
            label="Reset all agent settings"
            description="Puts every agent setting back to its original value, including permissions, profiles, memories, and scheduled tasks."
          >
            <Button variant="danger" icon={RotateCcw} onClick={() => setResetting(true)}>
              Reset
            </Button>
          </Row>
        </Panel>
      </Section>

      <Callout tone="warning">
        Changing these can make the agent slower, more expensive to run, or less predictable. The
        defaults suit almost everyone.
      </Callout>

      <ConfirmDialog
        open={resetting}
        title="Reset every agent setting?"
        body="Permissions, website rules, profiles, memories, scheduled tasks, and the activity log will all go back to their defaults. Your API key is kept. This cannot be undone."
        confirmLabel="Reset everything"
        danger
        onConfirm={async () => {
          await reset();
          setResetting(false);
        }}
        onCancel={() => setResetting(false)}
      />
    </>
  );
};
