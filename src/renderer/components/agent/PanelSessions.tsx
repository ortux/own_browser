import React from 'react';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { useAgentConfig } from '../../stores/agentConfigStore';
import { SENSITIVE_CATEGORY_META } from '../../../shared/agentConfig';
import { Section, Panel, Row, Switch, Callout } from './AgentUi';

export const PanelSessions: React.FC = () => {
  const config = useAgentConfig((s) => s.config);
  const update = useAgentConfig((s) => s.update);

  const patch = (next: Partial<typeof config.sessions>) =>
    update({ sessions: { ...config.sessions, ...next } });

  return (
    <>
      <Section
        title="Signed-in websites"
        description="You stay signed in to sites in this browser. These settings decide how much of that the agent may use."
      >
        <Panel>
          <Row
            label="Use websites you are already signed in to"
            description="Lets the agent work inside your accounts. With this off it only sees sites as a signed-out visitor would."
          >
            <Switch
              label="Use websites you are already signed in to"
              checked={config.sessions.useExistingSessions}
              onChange={(v) => patch({ useExistingSessions: v })}
            />
          </Row>

          <Row
            label="Ask before opening a signed-in site"
            description="A quick check before the agent starts working inside one of your accounts."
          >
            <Switch
              label="Ask before opening a signed-in site"
              checked={config.sessions.askBeforeLoggedIn}
              disabled={!config.sessions.useExistingSessions}
              onChange={(v) => patch({ askBeforeLoggedIn: v })}
            />
          </Row>

          <Row
            label="Always confirm on sensitive websites"
            description="Banking, email, and the other categories below always ask first, whatever your other settings say."
            icon={ShieldCheck}
          >
            <Switch
              label="Always confirm on sensitive websites"
              checked={config.sessions.confirmSensitiveSites}
              onChange={(v) => patch({ confirmSensitiveSites: v })}
            />
          </Row>
        </Panel>
      </Section>

      <Section
        title="Sensitive categories"
        description="Sites recognised as one of these will ask for confirmation before the agent acts. Turn one off if you would rather it did not."
      >
        <Panel>
          {SENSITIVE_CATEGORY_META.map((category) => (
            <Row
              key={category.id}
              label={category.label}
              description={category.description}
            >
              <Switch
                label={category.label}
                checked={config.sessions.sensitiveCategories[category.id]}
                disabled={!config.sessions.confirmSensitiveSites}
                onChange={(v) =>
                  patch({
                    sensitiveCategories: {
                      ...config.sessions.sensitiveCategories,
                      [category.id]: v,
                    },
                  })
                }
              />
            </Row>
          ))}
        </Panel>
      </Section>

      <Section title="Passwords">
        <Panel>
          <Row
            label="Saved passwords stay private"
            description="The agent can never read your saved passwords, and they are never sent to the AI provider. When a login form needs filling, the browser types the password in directly — the agent only sees that a password field exists."
            icon={KeyRound}
          >
            <span className="rounded bg-[color-mix(in_srgb,var(--success)_16%,transparent)] px-2 py-1 text-[10.5px] font-semibold tracking-[0.06em] text-[var(--success)]">
              ENFORCED
            </span>
          </Row>
        </Panel>
      </Section>

      <Callout>
        Recognising a sensitive site is based on a built-in list of well-known domains. If you use a
        bank or service that is not recognised, add it under Websites and set it to Ask or Blocked.
      </Callout>
    </>
  );
};
