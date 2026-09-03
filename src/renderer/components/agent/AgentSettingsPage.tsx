/**
 * AgentSettingsPage.tsx — the AI Agent settings centre.
 *
 * Rendered inside the existing Settings shell, so it inherits the page frame,
 * typography, and back navigation rather than reinventing them. The
 * sub-navigation is a second column because fourteen sections in the main rail
 * would swamp the six browser-level ones.
 */

import React from 'react';
import {
  Activity,
  Bot,
  Brain,
  CalendarClock,
  Files,
  Gauge,
  Globe,
  KeyRound,
  Bell,
  Settings2,
  Shield,
  ShieldCheck,
  UserSquare2,
  Wrench,
} from 'lucide-react';
import { useAgentConfig } from '../../stores/agentConfigStore';
import { AUTONOMY_LEVELS } from '../../../shared/agentConfig';
import { LoadingState, Callout } from './AgentUi';
import { PanelGeneral } from './PanelGeneral';
import { PanelAutonomy } from './PanelAutonomy';
import { PanelPermissions } from './PanelPermissions';
import { PanelWebsites } from './PanelWebsites';
import { PanelTools } from './PanelTools';
import { PanelFiles } from './PanelFiles';
import { PanelMemory } from './PanelMemory';
import { PanelSessions } from './PanelSessions';
import { PanelTasks } from './PanelTasks';
import { PanelNotifications } from './PanelNotifications';
import { PanelSecurity } from './PanelSecurity';
import { PanelActivity } from './PanelActivity';
import { PanelProfiles } from './PanelProfiles';
import { PanelAdvanced } from './PanelAdvanced';

const SECTIONS = [
  { id: 'general', label: 'General', icon: Bot, Panel: PanelGeneral },
  { id: 'autonomy', label: 'Autonomy', icon: Gauge, Panel: PanelAutonomy },
  { id: 'permissions', label: 'Permissions', icon: ShieldCheck, Panel: PanelPermissions },
  { id: 'websites', label: 'Websites', icon: Globe, Panel: PanelWebsites },
  { id: 'tools', label: 'Tools', icon: Wrench, Panel: PanelTools },
  { id: 'files', label: 'Files', icon: Files, Panel: PanelFiles },
  { id: 'memory', label: 'Memory', icon: Brain, Panel: PanelMemory },
  { id: 'sessions', label: 'Login & sessions', icon: KeyRound, Panel: PanelSessions },
  { id: 'tasks', label: 'Scheduled tasks', icon: CalendarClock, Panel: PanelTasks },
  { id: 'notifications', label: 'Notifications', icon: Bell, Panel: PanelNotifications },
  { id: 'security', label: 'Security', icon: Shield, Panel: PanelSecurity },
  { id: 'activity', label: 'Activity log', icon: Activity, Panel: PanelActivity },
  { id: 'profiles', label: 'Agent profiles', icon: UserSquare2, Panel: PanelProfiles },
  { id: 'advanced', label: 'Advanced', icon: Settings2, Panel: PanelAdvanced },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

export const AgentSettingsPage: React.FC = () => {
  const [section, setSection] = React.useState<SectionId>('general');
  const loading = useAgentConfig((s) => s.loading);
  const error = useAgentConfig((s) => s.error);
  const config = useAgentConfig((s) => s.config);
  const hasApiKey = useAgentConfig((s) => s.hasApiKey);
  const load = useAgentConfig((s) => s.load);

  React.useEffect(() => {
    void load();
  }, [load]);

  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];
  const Panel = current.Panel;
  const autonomy = AUTONOMY_LEVELS.find((l) => l.id === config.autonomy);

  if (loading) return <LoadingState label="Loading agent settings…" />;

  return (
    <div className="flex gap-8">
      {/* Sub-navigation */}
      <nav aria-label="Agent settings sections" className="sticky top-0 w-52 shrink-0 self-start">
        <div className="mb-3 rounded-md bg-[var(--surface)] px-3 py-2.5 shadow-sm">
          <div className="text-[11px] font-medium tracking-[0.08em] text-[var(--text-faint)]">
            STATUS
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                config.autonomy === 'stopped' ? 'bg-[var(--danger)]' : 'bg-[var(--success)]'
              }`}
            />
            <span className="text-[12.5px] text-[var(--text)]">{autonomy?.label}</span>
          </div>
          {!hasApiKey && (
            <div className="mt-1.5 text-[11.5px] leading-snug text-[var(--warning)]">
              No API key set
            </div>
          )}
        </div>

        <ul className="flex flex-col gap-0.5">
          {SECTIONS.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <li key={item.id}>
                <button
                  onClick={() => setSection(item.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-[13px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus-ring)] ${
                    active
                      ? 'bg-[var(--accent-soft)] font-medium text-[var(--accent-fg)]'
                      : 'text-[var(--text-muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]'
                  }`}
                >
                  <Icon size={15} strokeWidth={active ? 2.3 : 2} className="shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Panel */}
      <div className="min-w-0 flex-1">
        <h2 className="mb-6 text-[20px] font-normal leading-tight text-[var(--text)]">
          {current.label}
        </h2>

        {error && (
          <div className="mb-5">
            <Callout tone="danger">{error}</Callout>
          </div>
        )}

        <Panel />
      </div>
    </div>
  );
};
