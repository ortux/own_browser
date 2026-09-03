/**
 * agentConfigStore.ts — owns the agent configuration in the main process.
 *
 * Config lives here rather than in the renderer's zustand store for two
 * reasons. The agent runner is main-side and must be able to read permissions
 * synchronously at the moment it acts — a renderer round-trip would be both
 * slow and spoofable. And persisting through jsonStore gives crash-safe atomic
 * writes, so a power cut mid-save cannot leave a half-written permission file
 * that silently reverts to permissive defaults.
 *
 * Every mutation goes through `updateConfig`, which re-applies the policy
 * floor. Nothing in this file trusts its input.
 */

import {
  defaultAgentConfig,
  clampPermission,
  CONFIG_VERSION,
  AGENT_ACTIONS,
  AGENT_TOOLS,
  TOOL_META,
  type AgentConfig,
  type ActivityEntry,
  type MemoryEntry,
} from '../shared/agentConfig';
import { readJsonFile, writeJsonFile } from './jsonStore';

const FILENAME = 'agent-config.json';

/** Keep the log useful without letting it grow without bound. */
const MAX_ACTIVITY = 500;
const MAX_MEMORIES = 500;

let cached: AgentConfig | null = null;
const listeners = new Set<(config: AgentConfig) => void>();

/**
 * Merge a stored object over the defaults.
 *
 * A missing key must fall back to the default rather than to undefined: a
 * config written by an older build is missing whatever was added since, and a
 * permission read as undefined would be far worse than one read as its
 * conservative default.
 */
function reconcile(stored: unknown): AgentConfig {
  const base = defaultAgentConfig();
  if (!stored || typeof stored !== 'object') return base;
  const input = stored as Partial<AgentConfig>;

  const merged: AgentConfig = {
    ...base,
    ...input,
    version: CONFIG_VERSION,
    general: { ...base.general, ...(input.general ?? {}) },
    actions: { ...base.actions, ...(input.actions ?? {}) },
    tools: { ...base.tools, ...(input.tools ?? {}) },
    files: { ...base.files, ...(input.files ?? {}) },
    memory: { ...base.memory, ...(input.memory ?? {}) },
    sessions: {
      ...base.sessions,
      ...(input.sessions ?? {}),
      sensitiveCategories: {
        ...base.sessions.sensitiveCategories,
        ...(input.sessions?.sensitiveCategories ?? {}),
      },
    },
    notifications: {
      events: { ...base.notifications.events, ...(input.notifications?.events ?? {}) },
      channels: { ...base.notifications.channels, ...(input.notifications?.channels ?? {}) },
    },
    security: { ...base.security, ...(input.security ?? {}) },
    advanced: { ...base.advanced, ...(input.advanced ?? {}) },
    domains: Array.isArray(input.domains) ? input.domains : base.domains,
    tasks: Array.isArray(input.tasks) ? input.tasks : base.tasks,
    activity: Array.isArray(input.activity) ? input.activity : base.activity,
    profiles: Array.isArray(input.profiles) && input.profiles.length ? input.profiles : base.profiles,
  };

  // Built-in profiles are code, not data: refresh them from the current build
  // so a shipped fix to a profile reaches users who already have a config file.
  const builtIns = base.profiles;
  const custom = merged.profiles.filter((p) => !p.builtIn && !builtIns.some((b) => b.id === p.id));
  merged.profiles = [...builtIns, ...custom];
  if (!merged.profiles.some((p) => p.id === merged.activeProfileId)) {
    merged.activeProfileId = 'default';
  }

  return enforcePolicy(merged);
}

/**
 * Re-apply invariants that must hold no matter what is on disk.
 *
 * Called after every load and every write, so there is no window in which an
 * out-of-policy value is live.
 */
function enforcePolicy(config: AgentConfig): AgentConfig {
  for (const action of AGENT_ACTIONS) {
    const current = config.actions[action] ?? 'ask';
    config.actions[action] = clampPermission(action, current);
  }

  // A tool the build cannot actually provide is always off.
  for (const tool of AGENT_TOOLS) {
    const meta = TOOL_META.find((t) => t.id === tool);
    if (meta?.unavailable) config.tools[tool] = false;
    if (typeof config.tools[tool] !== 'boolean') config.tools[tool] = false;
  }

  // Session-only memories must never survive a restart.
  config.memory.entries = (config.memory.entries ?? []).filter((entry) => !entry.session);

  // Clamp the numeric limits into sane ranges.
  const s = config.security;
  s.maxActionsPerTask = clampNumber(s.maxActionsPerTask, 1, 500, 50);
  s.maxTabs = clampNumber(s.maxTabs, 1, 50, 5);
  s.maxRuntimeMinutes = clampNumber(s.maxRuntimeMinutes, 1, 240, 10);
  s.maxDownloadsPerTask = clampNumber(s.maxDownloadsPerTask, 0, 100, 3);

  const a = config.advanced;
  a.maxSteps = clampNumber(a.maxSteps, 1, 500, 40);
  a.requestTimeoutSeconds = clampNumber(a.requestTimeoutSeconds, 5, 600, 60);
  a.maxConcurrentTabs = clampNumber(a.maxConcurrentTabs, 1, 50, 5);

  config.general.temperature = clampNumber(config.general.temperature * 100, 0, 200, 30) / 100;

  config.activity = (config.activity ?? []).slice(0, MAX_ACTIVITY);
  config.memory.entries = config.memory.entries.slice(0, MAX_MEMORIES);

  return config;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value * 100) / 100));
}

/** The live config. Cheap to call; cached after the first read. */
export function getAgentConfig(): AgentConfig {
  if (!cached) cached = reconcile(readJsonFile(FILENAME));
  return cached;
}

/** Apply a partial change, enforce policy, persist, and notify. */
export function updateAgentConfig(patch: Partial<AgentConfig>): AgentConfig {
  const current = getAgentConfig();
  cached = enforcePolicy({ ...current, ...patch, version: CONFIG_VERSION });
  persist();
  return cached;
}

function persist(): void {
  if (!cached) return;
  // Session memories are deliberately excluded from what reaches disk.
  const toWrite: AgentConfig = {
    ...cached,
    memory: { ...cached.memory, entries: cached.memory.entries.filter((e) => !e.session) },
  };
  writeJsonFile(FILENAME, toWrite);
  for (const listener of listeners) listener(cached);
}

export function onAgentConfigChange(listener: (config: AgentConfig) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Restore everything to factory defaults. */
export function resetAgentConfig(): AgentConfig {
  cached = defaultAgentConfig();
  persist();
  return cached;
}

// ─── Activity log ────────────────────────────────────────────────────────────

let activitySeq = 0;

/**
 * Record something the agent did.
 *
 * Descriptions are written for a non-technical reader ("Opened github.com"),
 * because this log is the main way a user builds trust in what the agent did
 * while they were not watching.
 */
export function logActivity(entry: Omit<ActivityEntry, 'id' | 'at'>): ActivityEntry {
  const config = getAgentConfig();
  const full: ActivityEntry = {
    ...entry,
    id: `act-${Date.now()}-${++activitySeq}`,
    at: Date.now(),
  };
  cached = { ...config, activity: [full, ...config.activity].slice(0, MAX_ACTIVITY) };
  persist();
  return full;
}

export function clearActivity(): void {
  updateAgentConfig({ activity: [] });
}

// ─── Memory ──────────────────────────────────────────────────────────────────

let memorySeq = 0;

export function addMemory(content: string): MemoryEntry | null {
  const config = getAgentConfig();
  if (config.memory.mode === 'disabled') return null;

  const entry: MemoryEntry = {
    id: `mem-${Date.now()}-${++memorySeq}`,
    content: content.trim().slice(0, 2_000),
    createdAt: Date.now(),
    // In session mode the memory is held in RAM and never written to disk.
    session: config.memory.mode === 'session',
  };
  if (!entry.content) return null;

  cached = {
    ...config,
    memory: { ...config.memory, entries: [entry, ...config.memory.entries].slice(0, MAX_MEMORIES) },
  };
  persist();
  return entry;
}

export function updateMemory(id: string, content: string): void {
  const config = getAgentConfig();
  updateAgentConfig({
    memory: {
      ...config.memory,
      entries: config.memory.entries.map((entry) =>
        entry.id === id ? { ...entry, content: content.trim().slice(0, 2_000) } : entry
      ),
    },
  });
}

export function deleteMemory(id: string): void {
  const config = getAgentConfig();
  updateAgentConfig({
    memory: { ...config.memory, entries: config.memory.entries.filter((e) => e.id !== id) },
  });
}

export function clearMemories(): void {
  const config = getAgentConfig();
  updateAgentConfig({ memory: { ...config.memory, entries: [] } });
}

/** Drop session-scoped memories. Called on quit. */
export function dropSessionMemories(): void {
  const config = getAgentConfig();
  if (!config.memory.entries.some((e) => e.session)) return;
  updateAgentConfig({
    memory: { ...config.memory, entries: config.memory.entries.filter((e) => !e.session) },
  });
}
