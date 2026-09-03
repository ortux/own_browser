import React from 'react';
import { Eye, EyeOff, KeyRound } from 'lucide-react';
import { useAgentConfig } from '../../stores/agentConfigStore';
import {
  AGENT_PROVIDERS,
  AGENT_LANGUAGES,
  type DefaultBehavior,
  type ResponseLength,
} from '../../../shared/agentConfig';
import { Section, Panel, Row, Select, TextInput, Button, Callout } from './AgentUi';

const RESPONSE_LENGTHS: Array<{ id: ResponseLength; label: string }> = [
  { id: 'concise', label: 'Short — just the answer' },
  { id: 'balanced', label: 'Balanced' },
  { id: 'detailed', label: 'Detailed — explains its thinking' },
];

const BEHAVIORS: Array<{ id: DefaultBehavior; label: string; desc: string }> = [
  {
    id: 'ask',
    label: 'Ask before acting',
    desc: 'Checks with you before it does anything on a page.',
  },
  { id: 'balanced', label: 'Balanced', desc: 'Acts on its own, but pauses at anything risky.' },
  { id: 'autonomous', label: 'Autonomous', desc: 'Works straight through without stopping.' },
];

export const PanelGeneral: React.FC = () => {
  const config = useAgentConfig((s) => s.config);
  const hasApiKey = useAgentConfig((s) => s.hasApiKey);
  const update = useAgentConfig((s) => s.update);

  const [apiKey, setApiKey] = React.useState('');
  const [showKey, setShowKey] = React.useState(false);
  const [keyStatus, setKeyStatus] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  const provider = AGENT_PROVIDERS.find((p) => p.id === config.general.provider) ?? AGENT_PROVIDERS[0];

  const patchGeneral = (patch: Partial<typeof config.general>) =>
    update({ general: { ...config.general, ...patch } });

  const saveKey = async () => {
    const key = apiKey.trim();
    if (!key) return;
    setSaving(true);
    setKeyStatus('');
    try {
      const result = await window.browserAPI.agent.setApiKey(key);
      if (result.ok) {
        setApiKey('');
        setKeyStatus('Saved and encrypted with your system keychain.');
        await useAgentConfig.getState().load();
      } else if (result.reason === 'keychain-unavailable') {
        setKeyStatus('Your system keychain is unavailable, so the key was not saved.');
      } else {
        setKeyStatus('Could not save the key.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Section
        title="Identity"
        description="What the agent is called when it talks to you."
      >
        <Panel>
          <Row label="Agent name" description="Shown in the sidebar and in notifications." stacked>
            <TextInput
              label="Agent name"
              value={config.general.agentName}
              onChange={(v) => patchGeneral({ agentName: v.slice(0, 40) })}
              placeholder="Zyphora Agent"
            />
          </Row>
        </Panel>
      </Section>

      <Section
        title="Model"
        description="Which AI service the agent thinks with. Your key is stored encrypted on this computer and is never sent anywhere except the provider."
      >
        <Panel>
          <Row
            label="Provider"
            description="The company whose AI model runs the agent."
          >
            <Select
              label="Provider"
              className="w-64"
              value={config.general.provider}
              onChange={(v) => {
                const next = AGENT_PROVIDERS.find((p) => p.id === v);
                patchGeneral({ provider: v, model: next?.models[0].id ?? config.general.model });
              }}
              options={AGENT_PROVIDERS.map((p) => ({ id: p.id, label: p.label }))}
            />
          </Row>

          <Row label="Model" description="Faster models cost less; larger ones handle trickier pages.">
            <Select
              label="Model"
              className="w-64"
              value={config.general.model}
              onChange={(v) => patchGeneral({ model: v })}
              options={provider.models.map((m) => ({ id: m.id, label: m.label }))}
            />
          </Row>

          <Row
            label="API key"
            description={
              hasApiKey
                ? 'A key is saved. Enter a new one to replace it.'
                : 'The agent cannot run without a key.'
            }
            icon={KeyRound}
            stacked
          >
            <div className="flex gap-2">
              <div className="relative flex-1">
                <TextInput
                  label="API key"
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={setApiKey}
                  onEnter={saveKey}
                  placeholder={hasApiKey ? 'Replace saved key…' : 'AIza…'}
                  monospace
                />
                <button
                  onClick={() => setShowKey((v) => !v)}
                  aria-label={showKey ? 'Hide key' : 'Show key'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-faint)] hover:text-[var(--text)]"
                >
                  {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <Button variant="primary" onClick={saveKey} disabled={!apiKey.trim() || saving}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </div>
            {keyStatus && (
              <p className="mt-2 text-[12px] text-[var(--text-muted)]" role="status">
                {keyStatus}
              </p>
            )}
          </Row>
        </Panel>
      </Section>

      <Section title="Style" description="How the agent writes and how adventurous it is.">
        <Panel>
          <Row label="Response length" description="How much the agent says when reporting back.">
            <Select
              label="Response length"
              className="w-64"
              value={config.general.responseLength}
              onChange={(v) => patchGeneral({ responseLength: v as ResponseLength })}
              options={RESPONSE_LENGTHS}
            />
          </Row>

          <Row
            label="Creativity"
            description="Lower is more predictable and repeatable. Higher is more inventive, which is rarely what you want when filling in a form."
          >
            <div className="flex items-center gap-3">
              <input
                type="range"
                aria-label="Creativity"
                min={0}
                max={100}
                value={Math.round(config.general.temperature * 100)}
                onChange={(e) => patchGeneral({ temperature: Number(e.target.value) / 100 })}
                className="w-40 accent-[var(--accent)]"
              />
              <span className="w-8 text-right text-[12.5px] tabular-nums text-[var(--text-muted)]">
                {config.general.temperature.toFixed(2)}
              </span>
            </div>
          </Row>

          <Row label="Preferred language" description="The language the agent replies in.">
            <Select
              label="Preferred language"
              className="w-64"
              value={config.general.language}
              onChange={(v) => patchGeneral({ language: v })}
              options={AGENT_LANGUAGES}
            />
          </Row>
        </Panel>
      </Section>

      <Section
        title="Default behaviour"
        description="The starting point for how much the agent does on its own. You can fine-tune this in Autonomy."
      >
        <div className="grid gap-2.5 sm:grid-cols-3">
          {BEHAVIORS.map((behavior) => {
            const active = config.general.defaultBehavior === behavior.id;
            return (
              <button
                key={behavior.id}
                onClick={() =>
                  update({
                    general: { ...config.general, defaultBehavior: behavior.id },
                    // Keep the headline autonomy control in step, otherwise the
                    // two screens would quietly disagree.
                    autonomy: behavior.id === 'ask' ? 'ask' : behavior.id,
                  })
                }
                aria-pressed={active}
                className={`rounded-md p-3.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] ${
                  active
                    ? 'bg-[var(--accent-soft)] ring-1 ring-[var(--border-strong)]'
                    : 'bg-[var(--surface)] hover:bg-[var(--hover)]'
                }`}
              >
                <div className="text-[13.5px] font-medium text-[var(--text)]">{behavior.label}</div>
                <div className="mt-1 text-[12px] leading-relaxed text-[var(--text-muted)]">
                  {behavior.desc}
                </div>
              </button>
            );
          })}
        </div>
      </Section>

      <Callout>
        Whatever you choose here, purchases and payments always ask first. That one cannot be
        switched off.
      </Callout>
    </>
  );
};
