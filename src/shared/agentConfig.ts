/**
 * agentConfig.ts — the single source of truth for what the agent may do.
 *
 * This is a pure data + policy module: no Electron, no React, no I/O. It is
 * imported by the main process (which persists it and enforces it), by the
 * preload bridge, and by the settings UI, so all three agree on one shape.
 *
 * The important part is `resolvePermission()`. Every gate in the agent funnels
 * through it, so there is exactly one place where "may the agent do X on site
 * Y" is decided, and exactly one place to audit. Scattering that logic across
 * the UI would mean the settings screen and the runner could disagree — and
 * the failure mode of that disagreement is an agent that spends money it was
 * told not to.
 */

// ─── Permission primitives ───────────────────────────────────────────────────

/** The three states any capability can be in. */
export type PermissionState = 'allow' | 'ask' | 'never';

export const PERMISSION_LABELS: Record<PermissionState, string> = {
  allow: 'Allow automatically',
  ask: 'Ask every time',
  never: 'Never allow',
};

/** Short badge text, per the UX spec (SAFE / ASK / BLOCKED). */
export const PERMISSION_BADGES: Record<PermissionState, string> = {
  allow: 'SAFE',
  ask: 'ASK',
  never: 'BLOCKED',
};

// ─── Actions ─────────────────────────────────────────────────────────────────

export const AGENT_ACTIONS = [
  'open_website',
  'navigate',
  'read_content',
  'click',
  'scroll',
  'open_tab',
  'close_tab',
  'download',
  'upload',
  'submit_form',
  'send_message',
  'delete_content',
  'purchase',
  'change_settings',
] as const;

export type AgentActionId = (typeof AGENT_ACTIONS)[number];

export interface ActionMeta {
  id: AgentActionId;
  label: string;
  description: string;
  /** High-impact actions cannot be set to 'allow' — see clampPermission. */
  highImpact?: boolean;
}

export const ACTION_META: readonly ActionMeta[] = [
  {
    id: 'open_website',
    label: 'Open websites',
    description: 'Visit a web address you asked about.',
  },
  {
    id: 'navigate',
    label: 'Navigate pages',
    description: 'Move between pages, go back, and follow links.',
  },
  {
    id: 'read_content',
    label: 'Read page content',
    description: 'Read the text of a page so it can understand what is there.',
  },
  { id: 'click', label: 'Click things', description: 'Press buttons and links on a page.' },
  { id: 'scroll', label: 'Scroll', description: 'Scroll a page to see more of it.' },
  { id: 'open_tab', label: 'Open tabs', description: 'Open a new tab to work in.' },
  { id: 'close_tab', label: 'Close tabs', description: 'Close a tab it opened or you point it at.' },
  {
    id: 'download',
    label: 'Download files',
    description: 'Save a file from a website onto your computer.',
  },
  {
    id: 'upload',
    label: 'Upload files',
    description: 'Send a file from your computer to a website.',
  },
  {
    id: 'submit_form',
    label: 'Submit forms',
    description: 'Send a filled-in form, such as signing in or posting a comment.',
  },
  {
    id: 'send_message',
    label: 'Send messages',
    description: 'Send an email, chat message, or similar on your behalf.',
  },
  {
    id: 'delete_content',
    label: 'Delete things',
    description: 'Remove content, files, or records on a website.',
  },
  {
    id: 'purchase',
    label: 'Make purchases',
    description: 'Buy something or complete a payment.',
    highImpact: true,
  },
  {
    id: 'change_settings',
    label: 'Change browser settings',
    description: 'Alter how this browser itself is configured.',
  },
];

// ─── Tools ───────────────────────────────────────────────────────────────────

export const AGENT_TOOLS = [
  'web_browsing',
  'search',
  'screenshots',
  'dom_inspection',
  'javascript',
  'tab_management',
  'clipboard',
  'downloads',
  'file_read',
  'file_upload',
  'history',
  'bookmarks',
  'devtools',
  'terminal',
] as const;

export type AgentToolId = (typeof AGENT_TOOLS)[number];

export interface ToolMeta {
  id: AgentToolId;
  label: string;
  description: string;
  /** Requires an explicit confirmation step in the UI before enabling. */
  dangerous?: boolean;
  /** Warning shown when the tool is switched on. */
  warning?: string;
  /** Not wired to a real capability yet; shown disabled rather than faked. */
  unavailable?: boolean;
}

export const TOOL_META: readonly ToolMeta[] = [
  {
    id: 'web_browsing',
    label: 'Web browsing',
    description: 'Load and view web pages. The agent cannot do much without this.',
  },
  { id: 'search', label: 'Search', description: 'Look things up with your search engine.' },
  {
    id: 'screenshots',
    label: 'Screenshots',
    description: 'Capture what a page looks like to understand its layout.',
  },
  {
    id: 'dom_inspection',
    label: 'Page structure',
    description: 'Inspect the underlying structure of a page to find buttons and fields.',
  },
  {
    id: 'javascript',
    label: 'Run JavaScript',
    description: 'Execute code inside a page.',
    dangerous: true,
    warning:
      'Code running inside a page can read anything on it, including content from a site you are signed in to. Only enable this if you understand the risk.',
  },
  { id: 'tab_management', label: 'Tab management', description: 'Open, close, and switch tabs.' },
  {
    id: 'clipboard',
    label: 'Clipboard',
    description: 'Read from and write to your clipboard.',
    dangerous: true,
    warning: 'Your clipboard may contain passwords or other things you copied a moment ago.',
  },
  { id: 'downloads', label: 'Downloads', description: 'Save files from websites.' },
  {
    id: 'file_read',
    label: 'Read local files',
    description: 'Open files from folders you have permitted.',
    dangerous: true,
    warning: 'The agent will be able to read the contents of files in the folders you allow.',
  },
  {
    id: 'file_upload',
    label: 'Upload files',
    description: 'Attach your files to websites.',
    dangerous: true,
    warning: 'Uploading sends a copy of your file to a website, which you cannot take back.',
  },
  { id: 'history', label: 'Browsing history', description: 'Look through pages you have visited.' },
  { id: 'bookmarks', label: 'Bookmarks', description: 'Read and add bookmarks.' },
  {
    id: 'devtools',
    label: 'Developer tools',
    description: 'Use the browser developer tools.',
    dangerous: true,
    warning: 'Developer tools give deep access to page internals and network traffic.',
  },
  {
    id: 'terminal',
    label: 'Terminal',
    description: 'Run shell commands on your computer.',
    dangerous: true,
    unavailable: true,
    warning:
      'Shell access would let the agent run any program on your computer. Not supported in this build.',
  },
];

// ─── Autonomy ────────────────────────────────────────────────────────────────

export type AutonomyLevel = 'stopped' | 'ask' | 'balanced' | 'autonomous';

export interface AutonomyMeta {
  id: AutonomyLevel;
  label: string;
  description: string;
}

export const AUTONOMY_LEVELS: readonly AutonomyMeta[] = [
  {
    id: 'stopped',
    label: 'Stopped',
    description: 'The agent will not act at all. Use this to switch it off without losing setup.',
  },
  {
    id: 'ask',
    label: 'Ask before acting',
    description: 'Checks with you before every action. Slow, but nothing happens by surprise.',
  },
  {
    id: 'balanced',
    label: 'Balanced',
    description:
      'Reads, navigates, and fills things in freely. Asks before anything hard to undo. Recommended.',
  },
  {
    id: 'autonomous',
    label: 'Fully autonomous',
    description:
      'Works without stopping. Purchases and payments still always ask — that is not adjustable.',
  },
];

// ─── Domains ─────────────────────────────────────────────────────────────────

export interface DomainRule {
  /** A hostname, optionally with a leading '*.' wildcard. */
  pattern: string;
  state: PermissionState;
  /** Present for the sensitive-category defaults, absent for user entries. */
  note?: string;
}

/** Categories of site that always deserve an extra beat of thought. */
export const SENSITIVE_CATEGORIES = [
  'banking',
  'email',
  'cloud_storage',
  'password_managers',
  'government',
  'healthcare',
  'financial',
] as const;

export type SensitiveCategoryId = (typeof SENSITIVE_CATEGORIES)[number];

export interface SensitiveCategoryMeta {
  id: SensitiveCategoryId;
  label: string;
  description: string;
  /** Representative domains, used to classify a site automatically. */
  domains: readonly string[];
}

export const SENSITIVE_CATEGORY_META: readonly SensitiveCategoryMeta[] = [
  {
    id: 'banking',
    label: 'Banking',
    description: 'Bank accounts and card issuers.',
    domains: [
      'chase.com',
      'bankofamerica.com',
      'wellsfargo.com',
      'citi.com',
      'hsbc.com',
      'barclays.co.uk',
      'lloydsbank.com',
      'santander.com',
      'icicibank.com',
      'hdfcbank.com',
      'sbi.co.in',
      'axisbank.com',
      'kotak.com',
    ],
  },
  {
    id: 'email',
    label: 'Email',
    description: 'Inboxes and webmail.',
    domains: ['mail.google.com', 'gmail.com', 'outlook.com', 'outlook.live.com', 'mail.yahoo.com', 'proton.me', 'zoho.com'],
  },
  {
    id: 'cloud_storage',
    label: 'Cloud storage',
    description: 'Files you keep online.',
    domains: ['drive.google.com', 'dropbox.com', 'onedrive.live.com', 'box.com', 'icloud.com'],
  },
  {
    id: 'password_managers',
    label: 'Password managers',
    description: 'Vaults holding your credentials.',
    domains: ['1password.com', 'lastpass.com', 'bitwarden.com', 'dashlane.com', 'keeper.io'],
  },
  {
    id: 'government',
    label: 'Government',
    description: 'Tax, identity, and public services.',
    domains: ['gov.uk', 'irs.gov', 'ssa.gov', 'gov.in', 'uidai.gov.in', 'incometax.gov.in'],
  },
  {
    id: 'healthcare',
    label: 'Healthcare',
    description: 'Medical records and patient portals.',
    domains: ['nhs.uk', 'mychart.com', 'kaiserpermanente.org'],
  },
  {
    id: 'financial',
    label: 'Financial services',
    description: 'Investing, payments, and crypto.',
    domains: [
      'paypal.com',
      'stripe.com',
      'wise.com',
      'coinbase.com',
      'binance.com',
      'robinhood.com',
      'fidelity.com',
      'schwab.com',
      'zerodha.com',
    ],
  },
];

// ─── Files ───────────────────────────────────────────────────────────────────

export type FileAccessMode = 'none' | 'ask' | 'folders';

export interface FolderPermission {
  path: string;
  read: boolean;
  write: boolean;
  upload: boolean;
  delete: boolean;
}

// ─── Memory ──────────────────────────────────────────────────────────────────

export type MemoryMode = 'enabled' | 'session' | 'disabled';

export interface MemoryEntry {
  id: string;
  content: string;
  createdAt: number;
  /** Session memories are dropped on quit and never written to disk. */
  session?: boolean;
}

// ─── Scheduled tasks ─────────────────────────────────────────────────────────

export type TaskStatus = 'active' | 'paused';
export type TaskSchedule = 'hourly' | 'every_6_hours' | 'daily' | 'weekdays' | 'weekly';

export const SCHEDULE_LABELS: Record<TaskSchedule, string> = {
  hourly: 'Every hour',
  every_6_hours: 'Every 6 hours',
  daily: 'Every day',
  weekdays: 'Weekdays only',
  weekly: 'Every week',
};

export const SCHEDULE_INTERVAL_MS: Record<TaskSchedule, number> = {
  hourly: 60 * 60 * 1000,
  every_6_hours: 6 * 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekdays: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

export interface ScheduledTask {
  id: string;
  name: string;
  description: string;
  /** The natural-language goal handed to the agent. */
  prompt: string;
  schedule: TaskSchedule;
  status: TaskStatus;
  lastRun?: number;
  nextRun: number;
  /** Most recent outcomes, newest first, capped. */
  history: Array<{ at: number; ok: boolean; summary: string }>;
}

// ─── Notifications ───────────────────────────────────────────────────────────

export const NOTIFICATION_EVENTS = [
  'task_completed',
  'task_failed',
  'needs_input',
  'needs_permission',
  'download_completed',
  'scheduled_completed',
] as const;

export type NotificationEventId = (typeof NOTIFICATION_EVENTS)[number];

export interface NotificationChannels {
  desktop: boolean;
  inApp: boolean;
  sound: boolean;
}

export const NOTIFICATION_META: ReadonlyArray<{ id: NotificationEventId; label: string }> = [
  { id: 'task_completed', label: 'Task completed' },
  { id: 'task_failed', label: 'Task failed' },
  { id: 'needs_input', label: 'Agent needs your input' },
  { id: 'needs_permission', label: 'Agent needs permission' },
  { id: 'download_completed', label: 'Download completed' },
  { id: 'scheduled_completed', label: 'Scheduled task completed' },
];

// ─── Security ────────────────────────────────────────────────────────────────

export interface SecurityConfig {
  promptInjectionProtection: boolean;
  warnSuspiciousPages: boolean;
  pauseOnSuspicious: boolean;
  confirmExternalInstructions: boolean;
  blockDangerousDownloads: boolean;
  confirmOpeningDownloads: boolean;
  maxActionsPerTask: number;
  maxTabs: number;
  maxRuntimeMinutes: number;
  maxDownloadsPerTask: number;
}

// ─── Activity log ────────────────────────────────────────────────────────────

export type ActivityResult = 'ok' | 'failed' | 'blocked' | 'asked' | 'denied';

export interface ActivityEntry {
  id: string;
  at: number;
  domain: string;
  /** Plain-language description, written for a non-technical reader. */
  action: string;
  result: ActivityResult;
  permission: PermissionState;
  detail?: string;
}

// ─── Sessions ────────────────────────────────────────────────────────────────

export interface SessionConfig {
  /** May the agent act on sites you are already signed in to? */
  useExistingSessions: boolean;
  askBeforeLoggedIn: boolean;
  confirmSensitiveSites: boolean;
  /** Which sensitive categories are treated as requiring confirmation. */
  sensitiveCategories: Record<SensitiveCategoryId, boolean>;
}

// ─── Profiles ────────────────────────────────────────────────────────────────

/** The parts of the config a profile owns. */
export interface ProfileScope {
  autonomy: AutonomyLevel;
  actions: Record<AgentActionId, PermissionState>;
  tools: Record<AgentToolId, boolean>;
  domains: DomainRule[];
  security: SecurityConfig;
}

export interface AgentProfile extends ProfileScope {
  id: string;
  name: string;
  description: string;
  /** Built-ins cannot be deleted or renamed, only duplicated. */
  builtIn?: boolean;
}

// ─── General ─────────────────────────────────────────────────────────────────

export type ResponseLength = 'concise' | 'balanced' | 'detailed';
export type DefaultBehavior = 'ask' | 'balanced' | 'autonomous';

export interface GeneralConfig {
  agentName: string;
  provider: string;
  model: string;
  responseLength: ResponseLength;
  temperature: number;
  language: string;
  defaultBehavior: DefaultBehavior;
}

export interface AdvancedConfig {
  systemInstructions: string;
  maxSteps: number;
  requestTimeoutSeconds: number;
  maxConcurrentTabs: number;
  allowJavaScript: boolean;
  debugLogging: boolean;
  developerMode: boolean;
  /** Model Context Protocol server endpoints. */
  mcpServers: Array<{ id: string; name: string; url: string; enabled: boolean }>;
}

export interface AgentProvider {
  id: string;
  label: string;
  models: ReadonlyArray<{ id: string; label: string }>;
}

export const AGENT_PROVIDERS: readonly AgentProvider[] = [
  {
    id: 'gemini',
    label: 'Google Gemini',
    models: [
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash — fast, good default' },
      { id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite — cheapest' },
      { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro — most capable' },
    ],
  },
];

export const AGENT_LANGUAGES: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'auto', label: 'Match the page' },
  { id: 'en', label: 'English' },
  { id: 'es', label: 'Spanish' },
  { id: 'fr', label: 'French' },
  { id: 'de', label: 'German' },
  { id: 'hi', label: 'Hindi' },
  { id: 'bn', label: 'Bengali' },
  { id: 'zh', label: 'Chinese' },
  { id: 'ja', label: 'Japanese' },
  { id: 'ar', label: 'Arabic' },
  { id: 'pt', label: 'Portuguese' },
  { id: 'ru', label: 'Russian' },
];

// ─── The whole thing ─────────────────────────────────────────────────────────

export interface AgentConfig {
  version: number;
  general: GeneralConfig;
  autonomy: AutonomyLevel;
  actions: Record<AgentActionId, PermissionState>;
  domains: DomainRule[];
  tools: Record<AgentToolId, boolean>;
  files: {
    mode: FileAccessMode;
    folders: FolderPermission[];
  };
  memory: {
    mode: MemoryMode;
    entries: MemoryEntry[];
  };
  sessions: SessionConfig;
  tasks: ScheduledTask[];
  runWhenClosed: boolean;
  notifications: {
    events: Record<NotificationEventId, boolean>;
    channels: NotificationChannels;
  };
  security: SecurityConfig;
  activity: ActivityEntry[];
  profiles: AgentProfile[];
  activeProfileId: string;
  advanced: AdvancedConfig;
}

export const CONFIG_VERSION = 1;

// ─── Safety defaults ─────────────────────────────────────────────────────────

/**
 * Per §18. Reading and moving around are allowed; anything that writes to the
 * world, spends money, or cannot be undone starts at 'ask' or 'never'.
 */
export const DEFAULT_ACTIONS: Record<AgentActionId, PermissionState> = {
  open_website: 'allow',
  navigate: 'allow',
  read_content: 'allow',
  click: 'allow',
  scroll: 'allow',
  open_tab: 'allow',
  close_tab: 'allow',
  download: 'ask',
  upload: 'ask',
  submit_form: 'ask',
  send_message: 'ask',
  delete_content: 'ask',
  purchase: 'never',
  change_settings: 'ask',
};

export const DEFAULT_TOOLS: Record<AgentToolId, boolean> = {
  web_browsing: true,
  search: true,
  screenshots: true,
  dom_inspection: true,
  javascript: false,
  tab_management: true,
  clipboard: false,
  downloads: true,
  file_read: false,
  file_upload: false,
  history: false,
  bookmarks: true,
  devtools: false,
  terminal: false,
};

export const DEFAULT_SECURITY: SecurityConfig = {
  promptInjectionProtection: true,
  warnSuspiciousPages: true,
  pauseOnSuspicious: true,
  confirmExternalInstructions: true,
  blockDangerousDownloads: true,
  confirmOpeningDownloads: true,
  maxActionsPerTask: 50,
  maxTabs: 5,
  maxRuntimeMinutes: 10,
  maxDownloadsPerTask: 3,
};

function sensitiveDefaults(): Record<SensitiveCategoryId, boolean> {
  return SENSITIVE_CATEGORIES.reduce(
    (acc, id) => {
      acc[id] = true;
      return acc;
    },
    {} as Record<SensitiveCategoryId, boolean>
  );
}

/** Built-in profiles from §13. Each is a complete, coherent posture. */
function builtInProfiles(): AgentProfile[] {
  const base = (): ProfileScope => ({
    autonomy: 'balanced',
    actions: { ...DEFAULT_ACTIONS },
    tools: { ...DEFAULT_TOOLS },
    domains: [],
    security: { ...DEFAULT_SECURITY },
  });

  const developer = base();
  developer.tools = { ...developer.tools, dom_inspection: true, devtools: true, history: true };
  developer.actions = { ...developer.actions, download: 'allow', purchase: 'never' };
  developer.domains = [
    { pattern: '*.github.com', state: 'allow' },
    { pattern: 'github.com', state: 'allow' },
    { pattern: '*.stackoverflow.com', state: 'allow' },
    { pattern: 'developer.mozilla.org', state: 'allow' },
    { pattern: '*.npmjs.com', state: 'allow' },
  ];

  const research = base();
  research.actions = { ...research.actions, download: 'allow', purchase: 'never', submit_form: 'ask' };
  research.domains = [
    { pattern: '*.wikipedia.org', state: 'allow' },
    { pattern: 'scholar.google.com', state: 'allow' },
    { pattern: 'arxiv.org', state: 'allow' },
  ];

  const shopping = base();
  shopping.actions = {
    ...shopping.actions,
    click: 'allow',
    submit_form: 'ask',
    purchase: 'never',
  };
  shopping.domains = [
    { pattern: '*.amazon.com', state: 'ask' },
    { pattern: '*.ebay.com', state: 'ask' },
  ];

  const work = base();
  work.actions = {
    ...work.actions,
    send_message: 'ask',
    upload: 'ask',
    change_settings: 'never',
    purchase: 'never',
  };
  work.tools = { ...work.tools, file_read: false, file_upload: false };
  work.domains = [
    { pattern: 'docs.google.com', state: 'allow' },
    { pattern: 'drive.google.com', state: 'ask' },
  ];

  return [
    {
      id: 'default',
      name: 'Default',
      description: 'Balanced settings that suit most everyday use.',
      builtIn: true,
      ...base(),
    },
    {
      id: 'developer',
      name: 'Developer',
      description: 'Code hosts and docs are trusted. Downloads flow freely; purchases are blocked.',
      builtIn: true,
      ...developer,
    },
    {
      id: 'research',
      name: 'Research',
      description: 'Reading, searching, and saving papers. No purchases or account changes.',
      builtIn: true,
      ...research,
    },
    {
      id: 'shopping',
      name: 'Shopping',
      description: 'Compare products and fill a cart. Checkout and payment always ask first.',
      builtIn: true,
      ...shopping,
    },
    {
      id: 'work',
      name: 'Work',
      description: 'Documents and cloud storage. Sending mail and uploading need a nod from you.',
      builtIn: true,
      ...work,
    },
  ];
}

export function defaultAgentConfig(): AgentConfig {
  return {
    version: CONFIG_VERSION,
    general: {
      agentName: 'Zyphora Agent',
      provider: 'gemini',
      model: 'gemini-2.0-flash',
      responseLength: 'balanced',
      temperature: 0.3,
      language: 'auto',
      defaultBehavior: 'balanced',
    },
    autonomy: 'balanced',
    actions: { ...DEFAULT_ACTIONS },
    domains: [],
    tools: { ...DEFAULT_TOOLS },
    files: { mode: 'none', folders: [] },
    memory: { mode: 'enabled', entries: [] },
    sessions: {
      useExistingSessions: true,
      askBeforeLoggedIn: true,
      confirmSensitiveSites: true,
      sensitiveCategories: sensitiveDefaults(),
    },
    tasks: [],
    runWhenClosed: false,
    notifications: {
      events: {
        task_completed: true,
        task_failed: true,
        needs_input: true,
        needs_permission: true,
        download_completed: true,
        scheduled_completed: true,
      },
      channels: { desktop: true, inApp: true, sound: false },
    },
    security: { ...DEFAULT_SECURITY },
    activity: [],
    profiles: builtInProfiles(),
    activeProfileId: 'default',
    advanced: {
      systemInstructions: '',
      maxSteps: 40,
      requestTimeoutSeconds: 60,
      maxConcurrentTabs: 5,
      allowJavaScript: false,
      debugLogging: false,
      developerMode: false,
      mcpServers: [],
    },
  };
}

// ─── Policy ──────────────────────────────────────────────────────────────────

/**
 * Actions that may never be set to 'allow', whatever the UI or a restored
 * config file says.
 *
 * This is enforced in the setter rather than only in the UI, because a config
 * file is user-editable and a corrupted or hand-edited one must not be able to
 * grant silent purchasing power.
 */
export const NEVER_AUTO_ALLOW: ReadonlySet<AgentActionId> = new Set<AgentActionId>(['purchase']);

/** Clamp a requested permission to what policy permits for that action. */
export function clampPermission(action: AgentActionId, state: PermissionState): PermissionState {
  if (NEVER_AUTO_ALLOW.has(action) && state === 'allow') return 'ask';
  return state;
}

/** Normalise a hostname for comparison: lowercase, no port, no trailing dot. */
export function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, '').split(':')[0];
}

/** Extract a hostname from a URL, or '' if it has none. */
export function hostFromUrl(url: string): string {
  try {
    return normalizeHost(new URL(url).hostname);
  } catch {
    return '';
  }
}

/**
 * Does `pattern` match `host`?
 *
 * '*.example.com' matches any subdomain AND the bare domain, which is what
 * people mean when they type it — a rule that covered mail.example.com but not
 * example.com would be a trap.
 */
export function domainMatches(pattern: string, host: string): boolean {
  const p = normalizeHost(pattern.replace(/^\*\./, ''));
  const h = normalizeHost(host);
  if (!p || !h) return false;
  if (pattern.trim().startsWith('*.')) return h === p || h.endsWith(`.${p}`);
  return h === p;
}

/**
 * The most specific matching rule wins, so a rule for 'mail.google.com' beats
 * one for '*.google.com'. Specificity is measured by pattern length, with
 * exact matches preferred over wildcards at equal length.
 */
export function findDomainRule(domains: DomainRule[], host: string): DomainRule | null {
  let best: DomainRule | null = null;
  let bestScore = -1;
  for (const rule of domains) {
    if (!domainMatches(rule.pattern, host)) continue;
    const isWildcard = rule.pattern.trim().startsWith('*.');
    const score = rule.pattern.replace(/^\*\./, '').length * 2 + (isWildcard ? 0 : 1);
    if (score > bestScore) {
      bestScore = score;
      best = rule;
    }
  }
  return best;
}

/** Which sensitive category, if any, does this host belong to? */
export function sensitiveCategoryFor(host: string): SensitiveCategoryMeta | null {
  for (const category of SENSITIVE_CATEGORY_META) {
    for (const domain of category.domains) {
      if (domainMatches(`*.${domain}`, host)) return category;
    }
  }
  return null;
}

export interface PermissionQuery {
  action: AgentActionId;
  /** Page URL or bare hostname. Optional for actions with no page context. */
  url?: string;
}

export interface PermissionDecision {
  state: PermissionState;
  /** Plain-language explanation, shown in confirmation dialogs and the log. */
  reason: string;
  /** Set when the decision was driven by the site being sensitive. */
  sensitiveCategory?: SensitiveCategoryId;
}

/**
 * The one place that decides whether the agent may do something.
 *
 * Order matters, most restrictive first: a blocked domain beats a permissive
 * action setting, and a never-allow action beats a trusted domain. The
 * autonomy level can only tighten the result, never loosen it.
 */
export function resolvePermission(config: AgentConfig, query: PermissionQuery): PermissionDecision {
  const { action } = query;

  // 1. A stopped agent does nothing at all.
  if (config.autonomy === 'stopped') {
    return { state: 'never', reason: 'The agent is stopped.' };
  }

  const host = query.url ? (query.url.includes('://') ? hostFromUrl(query.url) : normalizeHost(query.url)) : '';

  // 2. A blocked domain overrides everything below it.
  const rule = host ? findDomainRule(config.domains, host) : null;
  if (rule?.state === 'never') {
    return { state: 'never', reason: `You have blocked the agent on ${rule.pattern}.` };
  }

  // 3. Policy floor: purchases can never be automatic.
  const actionState = clampPermission(action, config.actions[action] ?? 'ask');
  if (actionState === 'never') {
    return {
      state: 'never',
      reason: `"${ACTION_META.find((a) => a.id === action)?.label ?? action}" is turned off.`,
    };
  }

  // 4. Sensitive sites ask, even when the action would otherwise be automatic.
  if (host && config.sessions.confirmSensitiveSites) {
    const category = sensitiveCategoryFor(host);
    if (category && config.sessions.sensitiveCategories[category.id]) {
      return {
        state: 'ask',
        reason: `${host} looks like a ${category.label.toLowerCase()} site, so the agent checks with you first.`,
        sensitiveCategory: category.id,
      };
    }
  }

  // 5. A domain set to 'ask' tightens an otherwise-allowed action.
  let state = actionState;
  if (rule?.state === 'ask' && state === 'allow') {
    state = 'ask';
  }

  // 6. An explicitly trusted domain can relax 'ask' — but only for actions the
  //    user has not separately marked as needing a prompt, and never for the
  //    high-impact ones. Compare against the *clamped* value, not the raw
  //    config: reading config.actions directly here would let a hand-edited
  //    file re-promote a purchase to automatic through a trusted domain.
  if (rule?.state === 'allow' && state === 'ask' && actionState === 'allow') {
    state = 'allow';
  }

  // 7. Autonomy level, applied last, and only ever tightening.
  if (config.autonomy === 'ask' && state === 'allow') {
    const meta = ACTION_META.find((a) => a.id === action);
    // Reading and scrolling are not worth interrupting for even in ask mode.
    const trivial = action === 'read_content' || action === 'scroll';
    if (!trivial) {
      return {
        state: 'ask',
        reason: `You asked to approve every action${meta ? ` (${meta.label.toLowerCase()})` : ''}.`,
      };
    }
  }

  return {
    state,
    reason:
      state === 'allow'
        ? 'Allowed by your settings.'
        : rule
          ? `${rule.pattern} is set to ask first.`
          : 'This action asks for confirmation by default.',
  };
}

/** Is a tool available for use right now? */
export function isToolEnabled(config: AgentConfig, tool: AgentToolId): boolean {
  const meta = TOOL_META.find((t) => t.id === tool);
  if (meta?.unavailable) return false;
  return config.tools[tool] === true;
}

// ─── Validation ──────────────────────────────────────────────────────────────

/**
 * Is this a usable domain pattern?
 *
 * Accepts 'example.com' and '*.example.com'; rejects URLs, paths, spaces, and
 * bare TLDs. Returns an explanation rather than a boolean so the UI can say
 * what is wrong instead of just refusing.
 */
export function validateDomainPattern(input: string): { ok: boolean; error?: string; value?: string } {
  const raw = input.trim().toLowerCase();
  if (!raw) return { ok: false, error: 'Enter a website address.' };
  if (raw.includes(' ')) return { ok: false, error: 'A website address cannot contain spaces.' };
  if (raw.includes('://') || raw.includes('/')) {
    return { ok: false, error: 'Enter just the site, like example.com — no https:// or paths.' };
  }

  const wildcard = raw.startsWith('*.');
  const bare = wildcard ? raw.slice(2) : raw;
  if (bare.includes('*')) {
    return { ok: false, error: 'Wildcards are only supported at the start, like *.example.com.' };
  }
  if (!bare.includes('.')) return { ok: false, error: 'That does not look like a website address.' };
  if (!/^[a-z0-9.-]+$/.test(bare)) return { ok: false, error: 'Contains characters that are not valid in a domain.' };
  if (bare.startsWith('.') || bare.endsWith('.') || bare.includes('..')) {
    return { ok: false, error: 'That does not look like a website address.' };
  }
  const labels = bare.split('.');
  if (labels.length < 2 || labels.some((l) => !l)) {
    return { ok: false, error: 'That does not look like a website address.' };
  }
  if (labels[labels.length - 1].length < 2) {
    return { ok: false, error: 'That does not look like a website address.' };
  }

  return { ok: true, value: wildcard ? `*.${bare}` : bare };
}

export function validateProfileName(
  name: string,
  existing: AgentProfile[],
  selfId?: string
): { ok: boolean; error?: string } {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: 'Give the profile a name.' };
  if (trimmed.length > 40) return { ok: false, error: 'Keep the name under 40 characters.' };
  if (existing.some((p) => p.id !== selfId && p.name.toLowerCase() === trimmed.toLowerCase())) {
    return { ok: false, error: 'You already have a profile with that name.' };
  }
  return { ok: true };
}

/** Compute the next run time for a schedule, from `from`. */
export function nextRunAfter(schedule: TaskSchedule, from: number): number {
  const next = from + SCHEDULE_INTERVAL_MS[schedule];
  if (schedule !== 'weekdays') return next;
  // Skip forward over Saturday and Sunday.
  const date = new Date(next);
  while (date.getDay() === 0 || date.getDay() === 6) {
    date.setDate(date.getDate() + 1);
  }
  return date.getTime();
}
