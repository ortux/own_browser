/**
 * agentConfigStore.ts — renderer-side view of the agent configuration.
 *
 * Deliberately NOT a zustand `persist` store. The config is owned and
 * persisted by the main process, because the agent runner has to read
 * permissions at the instant it acts. Persisting a second copy here would
 * create two sources of truth that drift, and the drift would be invisible
 * until the day the agent did something the settings screen said it could not.
 *
 * So: main is authoritative, this is a cache. Writes go out over IPC and the
 * authoritative result comes back and replaces the cache.
 */

import { create } from 'zustand';
import {
  defaultAgentConfig,
  type AgentConfig,
  type AgentActionId,
  type AgentToolId,
  type PermissionState,
  type DomainRule,
  type AgentProfile,
  type ProfileScope,
} from '../../shared/agentConfig';

interface AgentConfigState {
  config: AgentConfig;
  hasApiKey: boolean;
  loading: boolean;
  error: string | null;

  load: () => Promise<void>;
  update: (patch: Partial<AgentConfig>) => Promise<void>;
  reset: () => Promise<void>;

  setAction: (action: AgentActionId, state: PermissionState) => Promise<void>;
  setTool: (tool: AgentToolId, enabled: boolean) => Promise<void>;
  addDomain: (rule: DomainRule) => Promise<void>;
  updateDomain: (pattern: string, next: Partial<DomainRule>) => Promise<void>;
  removeDomain: (pattern: string) => Promise<void>;

  applyProfile: (profileId: string) => Promise<void>;
  saveProfile: (profile: AgentProfile) => Promise<void>;
  deleteProfile: (profileId: string) => Promise<void>;
}

export const useAgentConfig = create<AgentConfigState>((set, get) => ({
  config: defaultAgentConfig(),
  hasApiKey: false,
  loading: true,
  error: null,

  load: async () => {
    try {
      const result = await window.browserAPI.agent.getConfig();
      set({ config: result.config, hasApiKey: result.hasApiKey, loading: false, error: null });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : 'Could not load agent settings.',
      });
    }
  },

  update: async (patch) => {
    // Apply optimistically so toggles feel instant, then reconcile with what
    // main actually stored — which may differ, since it clamps out-of-policy
    // values. The reconcile is what makes a rejected change visibly snap back.
    const previous = get().config;
    set({ config: { ...previous, ...patch } });
    try {
      const saved = await window.browserAPI.agent.updateConfig(patch);
      set({ config: saved, error: null });
    } catch (error) {
      set({
        config: previous,
        error: error instanceof Error ? error.message : 'Could not save that change.',
      });
    }
  },

  reset: async () => {
    const config = await window.browserAPI.agent.resetConfig();
    set({ config });
  },

  setAction: async (action, state) => {
    const { config, update } = get();
    await update({ actions: { ...config.actions, [action]: state } });
  },

  setTool: async (tool, enabled) => {
    const { config, update } = get();
    await update({ tools: { ...config.tools, [tool]: enabled } });
  },

  addDomain: async (rule) => {
    const { config, update } = get();
    const without = config.domains.filter((d) => d.pattern !== rule.pattern);
    await update({ domains: [...without, rule] });
  },

  updateDomain: async (pattern, next) => {
    const { config, update } = get();
    await update({
      domains: config.domains.map((d) => (d.pattern === pattern ? { ...d, ...next } : d)),
    });
  },

  removeDomain: async (pattern) => {
    const { config, update } = get();
    await update({ domains: config.domains.filter((d) => d.pattern !== pattern) });
  },

  applyProfile: async (profileId) => {
    const { config, update } = get();
    const profile = config.profiles.find((p) => p.id === profileId);
    if (!profile) return;
    // Switching profile swaps in the whole permission posture at once.
    await update({
      activeProfileId: profileId,
      autonomy: profile.autonomy,
      actions: { ...profile.actions },
      tools: { ...profile.tools },
      domains: [...profile.domains],
      security: { ...profile.security },
    });
  },

  saveProfile: async (profile) => {
    const { config, update } = get();
    const exists = config.profiles.some((p) => p.id === profile.id);
    await update({
      profiles: exists
        ? config.profiles.map((p) => (p.id === profile.id ? profile : p))
        : [...config.profiles, profile],
    });
  },

  deleteProfile: async (profileId) => {
    const { config, update } = get();
    const target = config.profiles.find((p) => p.id === profileId);
    if (!target || target.builtIn) return;
    await update({
      profiles: config.profiles.filter((p) => p.id !== profileId),
      activeProfileId: config.activeProfileId === profileId ? 'default' : config.activeProfileId,
    });
  },
}));

/** Snapshot the current settings as a profile's scope. */
export function scopeFromConfig(config: AgentConfig): ProfileScope {
  return {
    autonomy: config.autonomy,
    actions: { ...config.actions },
    tools: { ...config.tools },
    domains: [...config.domains],
    security: { ...config.security },
  };
}
