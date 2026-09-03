import React from 'react';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { useAgentConfig } from '../../stores/agentConfigStore';
import { DEFAULT_SECURITY, type SecurityConfig } from '../../../shared/agentConfig';
import { Section, Panel, Row, Switch, NumberField, Callout, Button } from './AgentUi';

const PROTECTIONS: Array<{ key: keyof SecurityConfig; label: string; desc: string }> = [
  {
    key: 'warnSuspiciousPages',
    label: 'Warn about suspicious pages',
    desc: 'Tell you when a page contains text that looks like it is trying to give the agent orders.',
  },
  {
    key: 'pauseOnSuspicious',
    label: 'Pause when something looks wrong',
    desc: 'Stop and wait for you rather than carrying on past a suspicious page.',
  },
  {
    key: 'confirmExternalInstructions',
    label: 'Confirm instructions found on pages',
    desc: 'If a page asks the agent to do something you did not, check with you first.',
  },
  {
    key: 'blockDangerousDownloads',
    label: 'Block risky downloads',
    desc: 'Refuse file types that commonly carry malware, such as programs and scripts.',
  },
  {
    key: 'confirmOpeningDownloads',
    label: 'Confirm before opening a download',
    desc: 'The agent never opens a downloaded file without asking.',
  },
];

const LIMITS: Array<{
  key: keyof SecurityConfig;
  label: string;
  desc: string;
  min: number;
  max: number;
  suffix: string;
}> = [
  {
    key: 'maxActionsPerTask',
    label: 'Maximum actions per task',
    desc: 'Stops a confused agent from clicking around forever.',
    min: 1,
    max: 500,
    suffix: 'actions',
  },
  {
    key: 'maxTabs',
    label: 'Maximum tabs',
    desc: 'How many tabs the agent may have open at once.',
    min: 1,
    max: 50,
    suffix: 'tabs',
  },
  {
    key: 'maxRuntimeMinutes',
    label: 'Maximum time per task',
    desc: 'The agent gives up and reports back after this long.',
    min: 1,
    max: 240,
    suffix: 'minutes',
  },
  {
    key: 'maxDownloadsPerTask',
    label: 'Maximum downloads per task',
    desc: 'A cap on how many files one task may save.',
    min: 0,
    max: 100,
    suffix: 'files',
  },
];

export const PanelSecurity: React.FC = () => {
  const config = useAgentConfig((s) => s.config);
  const update = useAgentConfig((s) => s.update);

  const patch = (next: Partial<SecurityConfig>) =>
    update({ security: { ...config.security, ...next } });

  const injectionOff = !config.security.promptInjectionProtection;

  return (
    <>
      <Section
        title="Prompt injection protection"
        description="Websites can hide instructions in their text hoping the agent will follow them instead of you. This is the main defence against that."
      >
        <Panel>
          <Row
            label="Protect the agent from instructions hidden in webpages"
            description="Page content is treated as information to read, never as commands to obey. Strongly recommended."
            icon={injectionOff ? ShieldAlert : ShieldCheck}
            danger={injectionOff}
          >
            <Switch
              label="Prompt injection protection"
              checked={config.security.promptInjectionProtection}
              onChange={(v) => patch({ promptInjectionProtection: v })}
            />
          </Row>
        </Panel>

        {injectionOff && (
          <div className="mt-3">
            <Callout tone="danger">
              <strong>Protection is off.</strong> A malicious page could now talk the agent into
              acting against you — sending your data somewhere, or using an account you are signed
              in to. Only leave this off if you are testing something specific.
            </Callout>
          </div>
        )}
      </Section>

      <Section title="Additional safeguards">
        <Panel>
          {PROTECTIONS.map((item) => (
            <Row key={item.key} label={item.label} description={item.desc}>
              <Switch
                label={item.label}
                checked={config.security[item.key] as boolean}
                onChange={(v) => patch({ [item.key]: v } as Partial<SecurityConfig>)}
              />
            </Row>
          ))}
        </Panel>
      </Section>

      <Section
        title="Limits"
        description="Hard ceilings on a single task. These stop a runaway agent from doing a lot of damage quickly, so keep them low unless you have a reason."
      >
        <Panel>
          {LIMITS.map((limit) => (
            <Row key={limit.key} label={limit.label} description={limit.desc}>
              <NumberField
                label={limit.label}
                value={config.security[limit.key] as number}
                min={limit.min}
                max={limit.max}
                suffix={limit.suffix}
                onChange={(v) => patch({ [limit.key]: v } as Partial<SecurityConfig>)}
              />
            </Row>
          ))}
        </Panel>

        <div className="mt-3 flex justify-end">
          <Button size="sm" onClick={() => patch({ ...DEFAULT_SECURITY })}>
            Restore recommended limits
          </Button>
        </div>
      </Section>
    </>
  );
};
