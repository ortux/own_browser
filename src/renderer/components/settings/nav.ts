/**
 * nav.ts — the Settings sidebar model.
 *
 * Every entry points at something that really exists: a panel in
 * SettingsPage, a section of the agent settings, or an anchor inside the
 * General page. Nothing here is decorative.
 */

import type React from 'react';
import {
  Accessibility,
  Bot,
  Blocks,
  Brain,
  Cpu,
  Download,
  Globe,
  Info,
  KeyRound,
  Languages,
  Layers,
  Lock,
  Palette,
  Play,
  RefreshCw,
  RotateCcw,
  Search as SearchIcon,
  Settings as SettingsIcon,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';

import type { SectionId } from './sections';

export type { SectionId };
export { searchSettings, SEARCH_INDEX, type SearchEntry } from './searchIndex';

export interface NavItem {
  id: SectionId;
  label: string;
  icon: React.ElementType;
  /**
   * When set, the section is rendered by the General page scrolled to this
   * anchor — the General page already owns that setting, so pointing at it is
   * correct rather than duplicating it.
   */
  generalAnchor?: string;
  /** When set, renders the agent settings opened at this sub-section. */
  agentSection?: string;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: 'General',
    items: [
      { id: 'general', label: 'General', icon: SettingsIcon },
      { id: 'appearance', label: 'Appearance', icon: Palette, generalAnchor: 'appearance' },
      { id: 'search', label: 'Search', icon: SearchIcon },
      { id: 'tabs', label: 'Tabs', icon: Layers, generalAnchor: 'tabs' },
      { id: 'languages', label: 'Languages', icon: Languages, generalAnchor: 'language' },
      {
        id: 'accessibility',
        label: 'Accessibility',
        icon: Accessibility,
        generalAnchor: 'accessibility',
      },
    ],
  },
  {
    title: 'Privacy & Security',
    items: [
      { id: 'privacy', label: 'Privacy', icon: Lock },
      { id: 'security', label: 'Security', icon: Shield },
      { id: 'permissions', label: 'Site Permissions', icon: ShieldCheck },
      { id: 'passwords', label: 'Passwords', icon: KeyRound },
      { id: 'clear-data', label: 'Clear Browsing Data', icon: Trash2 },
    ],
  },
  {
    title: 'AI',
    items: [
      { id: 'ai-agent', label: 'AI Agent', icon: Bot, agentSection: 'general' },
      {
        id: 'agent-permissions',
        label: 'Agent Permissions',
        icon: ShieldCheck,
        agentSection: 'permissions',
      },
      { id: 'memory', label: 'Memory', icon: Brain, agentSection: 'memory' },
      { id: 'ai-models', label: 'AI Models', icon: Cpu, agentSection: 'advanced' },
    ],
  },
  {
    title: 'Browser',
    items: [
      { id: 'downloads', label: 'Downloads', icon: Download },
      { id: 'extensions', label: 'Extensions', icon: Blocks },
      {
        id: 'default-browser',
        label: 'Default Browser',
        icon: Globe,
        generalAnchor: 'default-browser',
      },
      { id: 'sync', label: 'Sync', icon: RefreshCw },
    ],
  },
  {
    title: 'System',
    items: [
      { id: 'performance', label: 'Performance', icon: SlidersHorizontal },
      { id: 'startup', label: 'Startup', icon: Play, generalAnchor: 'startup' },
      { id: 'updates', label: 'Updates', icon: RotateCcw },
      { id: 'about', label: 'About', icon: Info },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

export function findNavItem(id: SectionId): NavItem {
  return ALL_NAV_ITEMS.find((item) => item.id === id) ?? ALL_NAV_ITEMS[0];
}

export const SECTION_LABELS: Record<SectionId, string> = Object.fromEntries(
  ALL_NAV_ITEMS.map((item) => [item.id, item.label])
) as Record<SectionId, string>;

// Re-exported so the shell can render an icon for a bare section id.
export const SECTION_ICONS: Record<SectionId, React.ElementType> = Object.fromEntries(
  ALL_NAV_ITEMS.map((item) => [item.id, item.icon])
) as Record<SectionId, React.ElementType>;
