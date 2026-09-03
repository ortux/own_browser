import React from 'react';
import { Bell, Monitor, Volume2 } from 'lucide-react';
import { useAgentConfig } from '../../stores/agentConfigStore';
import { NOTIFICATION_META } from '../../../shared/agentConfig';
import { Section, Panel, Row, Switch, Callout } from './AgentUi';

export const PanelNotifications: React.FC = () => {
  const config = useAgentConfig((s) => s.config);
  const update = useAgentConfig((s) => s.update);

  const { events, channels } = config.notifications;
  const anyChannel = channels.desktop || channels.inApp || channels.sound;

  return (
    <>
      <Section
        title="How to notify you"
        description="Where notifications appear. Turn all of these off and the agent will work silently."
      >
        <Panel>
          <Row
            label="Desktop notifications"
            description="System notifications, so you see them even when the browser is behind another window."
            icon={Monitor}
          >
            <Switch
              label="Desktop notifications"
              checked={channels.desktop}
              onChange={(v) =>
                update({ notifications: { events, channels: { ...channels, desktop: v } } })
              }
            />
          </Row>
          <Row
            label="In-browser notifications"
            description="A quiet banner inside Zyphora."
            icon={Bell}
          >
            <Switch
              label="In-browser notifications"
              checked={channels.inApp}
              onChange={(v) =>
                update({ notifications: { events, channels: { ...channels, inApp: v } } })
              }
            />
          </Row>
          <Row label="Sound" description="A short chime alongside the notification." icon={Volume2}>
            <Switch
              label="Sound"
              checked={channels.sound}
              onChange={(v) =>
                update({ notifications: { events, channels: { ...channels, sound: v } } })
              }
            />
          </Row>
        </Panel>
      </Section>

      <Section
        title="What to notify you about"
        description="Choose which moments are worth interrupting you for."
      >
        <Panel>
          {NOTIFICATION_META.map((event) => (
            <Row key={event.id} label={event.label}>
              <Switch
                label={event.label}
                checked={events[event.id]}
                disabled={!anyChannel}
                onChange={(v) =>
                  update({ notifications: { events: { ...events, [event.id]: v }, channels } })
                }
              />
            </Row>
          ))}
        </Panel>
      </Section>

      {!anyChannel && (
        <Callout tone="warning">
          Every notification method is switched off, so none of the above will reach you. The agent
          will still pause and wait when it needs permission — you just will not be told about it
          until you look.
        </Callout>
      )}
    </>
  );
};
