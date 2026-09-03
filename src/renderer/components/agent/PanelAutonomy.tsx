import React from 'react';
import { Ban, Gauge, HandMetal, Zap } from 'lucide-react';
import { useAgentConfig } from '../../stores/agentConfigStore';
import {
  ACTION_META,
  AUTONOMY_LEVELS,
  NEVER_AUTO_ALLOW,
  resolvePermission,
  type AutonomyLevel,
} from '../../../shared/agentConfig';
import { Section, Panel, Row, PermissionPicker, Callout, PermissionBadge } from './AgentUi';

const LEVEL_ICONS: Record<AutonomyLevel, React.ElementType> = {
  stopped: Ban,
  ask: HandMetal,
  balanced: Gauge,
  autonomous: Zap,
};

export const PanelAutonomy: React.FC = () => {
  const config = useAgentConfig((s) => s.config);
  const update = useAgentConfig((s) => s.update);
  const setAction = useAgentConfig((s) => s.setAction);

  return (
    <>
      <Section
        title="Autonomy level"
        description="The master control. Everything below is only ever applied more strictly than this, never more loosely."
      >
        <div className="grid gap-2.5 sm:grid-cols-2">
          {AUTONOMY_LEVELS.map((level) => {
            const Icon = LEVEL_ICONS[level.id];
            const active = config.autonomy === level.id;
            const stopped = level.id === 'stopped';
            return (
              <button
                key={level.id}
                onClick={() => update({ autonomy: level.id })}
                aria-pressed={active}
                className={`flex gap-3 rounded-md p-4 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] ${
                  active
                    ? stopped
                      ? 'bg-[var(--danger-soft)] ring-1 ring-[var(--danger)]'
                      : 'bg-[var(--accent-soft)] ring-1 ring-[var(--border-strong)]'
                    : 'bg-[var(--surface)] hover:bg-[var(--hover)]'
                }`}
              >
                <Icon
                  size={17}
                  className={`mt-0.5 shrink-0 ${
                    active && stopped
                      ? 'text-[var(--danger)]'
                      : active
                        ? 'text-[var(--text)]'
                        : 'text-[var(--text-faint)]'
                  }`}
                />
                <span className="min-w-0">
                  <span className="block text-[14px] font-medium text-[var(--text)]">
                    {level.label}
                  </span>
                  <span className="mt-1 block text-[12.5px] leading-relaxed text-[var(--text-muted)]">
                    {level.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </Section>

      {config.autonomy === 'stopped' && (
        <div className="mb-9">
          <Callout tone="danger">
            The agent is stopped and will not act at all. Your settings are kept — pick another
            level above to start it again.
          </Callout>
        </div>
      )}

      <Section
        title="What the agent may do"
        description="Fine-grained control over each kind of action. The badge shows what would actually happen right now, once your autonomy level is taken into account."
      >
        <Panel>
          {ACTION_META.map((action) => {
            const configured = config.actions[action.id];
            // Show the effective outcome, not just the stored value: a user who
            // set "allow" while on ask-mode should see that it still asks.
            const effective = resolvePermission(config, { action: action.id }).state;
            const differs = effective !== configured;

            return (
              <Row
                key={action.id}
                label={
                  <span className="flex items-center gap-2">
                    {action.label}
                    {differs && <PermissionBadge state={effective} />}
                  </span>
                }
                description={
                  differs
                    ? `${action.description} Currently ${
                        effective === 'never' ? 'blocked' : 'asking first'
                      } because of your autonomy level.`
                    : action.description
                }
                danger={action.highImpact}
              >
                <PermissionPicker
                  label={action.label}
                  value={configured}
                  disallowAllow={NEVER_AUTO_ALLOW.has(action.id)}
                  onChange={(next) => setAction(action.id, next)}
                />
              </Row>
            );
          })}
        </Panel>
      </Section>

      <Callout tone="warning">
        Purchases can only be set to <strong>Ask</strong> or <strong>Never</strong>. The agent will
        never complete a payment without you approving that specific payment.
      </Callout>
    </>
  );
};
