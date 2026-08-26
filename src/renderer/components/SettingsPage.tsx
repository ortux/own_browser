import React, { useState, useEffect } from 'react';
import { ArrowLeft, Check, Image as ImageIcon, Search as SearchIcon, User, Globe, Plus, X, Shield, Sun, Moon, Monitor, Wifi, WifiOff, RefreshCw, AlertTriangle, Download, FolderOpen, Trash2 } from 'lucide-react';
import { useSettingsStore, SEARCH_ENGINES } from '../stores/settingsStore';
import { useProxy } from '../hooks/useProxy';
import type { SecuritySettings } from '../stores/settingsStore';

interface SettingsPageProps {
  onBack: () => void;
}

const THEMES: { id: 'light' | 'dark' | 'system'; label: string; icon: React.ElementType }[] = [
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'system', label: 'System', icon: Monitor },
];

const SECURITY_OPTIONS: { key: keyof SecuritySettings; label: string; desc: string }[] = [
  {
    key: 'blockTrackers',
    label: 'Block trackers & ads',
    desc: 'Prevent known trackers from following you across sites.',
  },
  {
    key: 'forceHttps',
    label: 'Force HTTPS',
    desc: 'Upgrade insecure http:// connections to https://.',
  },
  {
    key: 'doNotTrack',
    label: 'Send Do Not Track',
    desc: 'Request that sites do not track your activity.',
  },
  {
    key: 'privateByDefault',
    label: 'Private tabs by default',
    desc: 'Open new tabs without saving history or cookies.',
  },
];

function engineFavicon(url: string): string | null {
  try {
    const domain = new URL(url.replace(/%s/gi, '')).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
  } catch {
    return null;
  }
}

// Material-style switch. Kept as a local component since it is reused
// across three sections and the pressed/track states are identical.
const MdSwitch: React.FC<{ checked: boolean; onChange: () => void; disabled?: boolean }> = ({
  checked,
  onChange,
  disabled,
}) => (
  <button
    role="switch"
    aria-checked={checked}
    onClick={onChange}
    disabled={disabled}
    className={`relative h-8 w-[52px] shrink-0 rounded-full border-2 transition-colors duration-200 ease-out disabled:opacity-40 ${
      checked
        ? 'border-[var(--accent)] bg-[var(--accent)]'
        : 'border-[var(--border-strong)] bg-transparent'
    }`}
  >
    <span
      className={`absolute top-1/2 -translate-y-1/2 rounded-full shadow-sm transition-all duration-200 ease-out ${
        checked
          ? 'left-[26px] h-5 w-5 bg-white'
          : 'left-[5px] h-4 w-4 bg-[var(--text-faint)]'
      }`}
    />
  </button>
);

export const SettingsPage: React.FC<SettingsPageProps> = ({ onBack }) => {
  const {
    searchEngineId,
    setSearchEngine,
    customSearchEngines,
    addCustomSearchEngine,
    removeCustomSearchEngine,
    security,
    setSecurityFlag,
    theme,
    setTheme,
    newTabMode,
    setNewTabMode,
    downloadPath,
    setDownloadPath,
    openDownloadsOnStart,
    setOpenDownloadsOnStart,
  } = useSettingsStore();

  const [activeSection, setActiveSection] = useState<'general' | 'search' | 'appearance' | 'security' | 'proxy' | 'downloads'>('general');

  const { proxy, proxyEnabled, status: proxyStatus, error: proxyError, fetchAndApply, toggle: toggleProxy } = useProxy();

  const allEngines = [...SEARCH_ENGINES, ...customSearchEngines];

  // Apply the selected theme to the document root (extension point for styling)
  useEffect(() => {
    const root = document.documentElement;
    const resolved =
      theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : theme;
    root.dataset.theme = resolved;
    root.classList.toggle('dark', resolved === 'dark');
  }, [theme]);

  const [showAdd, setShowAdd] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [customError, setCustomError] = useState('');
  const [clearingData, setClearingData] = useState(false);
  const [clearDataStatus, setClearDataStatus] = useState('');

  // Initialise the download path from the OS default if the user hasn't set one,
  // and keep the main process in sync whenever it changes.
  useEffect(() => {
    if (!downloadPath) {
      window.browserAPI.downloads.defaultPath().then((p) => {
        if (p) setDownloadPath(p);
      }).catch(() => {});
    }
  }, [downloadPath, setDownloadPath]);

  useEffect(() => {
    if (downloadPath) {
      window.browserAPI.downloads.setPath(downloadPath).catch(() => {});
    }
  }, [downloadPath]);

  // Live ad-blocker stats (blocked request count)
  const [adblockStats, setAdblockStats] = useState<{ enabled: boolean; blocked: number }>({
    enabled: true,
    blocked: 0,
  });

  useEffect(() => {
    window.browserAPI.adblock.stats().then(setAdblockStats).catch(() => {});
    const unsub = window.browserAPI.onAdblockStats(setAdblockStats);
    return unsub;
  }, []);

  const handleAddCustom = () => {
    const ok = addCustomSearchEngine(customName, customUrl);
    if (!ok) {
      setCustomError('URL must start with http(s):// and contain the %s query placeholder.');
      return;
    }
    setShowAdd(false);
    setCustomName('');
    setCustomUrl('');
    setCustomError('');
  };

  const NAV_ITEMS = [
    { id: 'general', label: 'General', icon: User },
    { id: 'search', label: 'Search engine', icon: SearchIcon },
    { id: 'appearance', label: 'Appearance', icon: ImageIcon },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'downloads', label: 'Downloads', icon: Download },
    { id: 'proxy', label: 'Proxy', icon: Wifi },
  ] as const;

  return (
    <div className="flex w-full h-full bg-[var(--bg)] text-[var(--text)] overflow-hidden">
      {/* Navigation rail */}
      <aside className="flex w-64 shrink-0 flex-col bg-[var(--surface)] h-full p-3">
        <button
          onClick={onBack}
          className="mb-4 flex items-center gap-3 rounded-full px-4 py-2.5 text-sm font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text)]"
        >
          <ArrowLeft size={18} /> Back
        </button>

        <div className="px-4 pb-2 pt-3 text-xs font-medium tracking-[0.08em] text-[var(--text-faint)]">
          SETTINGS
        </div>

        <nav className="flex flex-col gap-0.5 px-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={`group relative flex items-center gap-4 rounded-full px-4 py-2.5 text-sm transition-colors duration-150 ${
                  active
                    ? 'bg-[var(--accent-soft)] font-medium text-[var(--accent)]'
                    : 'text-[var(--text-muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]'
                }`}
              >
                <Icon size={18} strokeWidth={active ? 2.4 : 2} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto px-4 py-2 text-[11px] tracking-wide text-[var(--text-faint)]">
          Zyphora
        </div>
      </aside>

      {/* Scrollable content */}
      <main className="flex-1 overflow-y-auto h-full">
        <div className="mx-auto max-w-2xl px-10 py-12">
          <h1 className="mb-10 text-[28px] font-normal leading-tight">
            {NAV_ITEMS.find((n) => n.id === activeSection)?.label}
          </h1>

          {activeSection === 'general' && (
            <div className="space-y-4">
              <MdCard>
                <p className="text-sm leading-relaxed text-[var(--text-muted)]">
                  Account settings are not available yet. This section is reserved for
                  future profile and sync features.
                </p>
              </MdCard>
              <MdCard className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-[var(--text)]">Clear browsing data</div>
                  <div className="mt-0.5 text-xs text-[var(--text-faint)]">
                    Remove local history, cookies, cache, and site storage from the default session.
                  </div>
                  {clearDataStatus && <p className="mt-2 text-xs text-green-400">{clearDataStatus}</p>}
                </div>
                <button
                  type="button"
                  disabled={clearingData}
                  onClick={async () => {
                    if (!window.confirm('Clear history, cookies, cache, and site storage?')) return;
                    setClearingData(true);
                    setClearDataStatus('');
                    try {
                      await window.browserAPI.privacy.clearData();
                      setClearDataStatus('Browsing data cleared.');
                    } catch {
                      setClearDataStatus('Could not clear all browsing data.');
                    } finally {
                      setClearingData(false);
                    }
                  }}
                  className="flex shrink-0 items-center gap-2 rounded-full border border-red-400/40 px-3 py-2 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                >
                  <Trash2 size={14} /> {clearingData ? 'Clearing…' : 'Clear data'}
                </button>
              </MdCard>
            </div>
          )}

          {activeSection === 'search' && (
            <div className="space-y-3">
              <MdCard padded={false}>
                {allEngines.map((engine, i) => {
                  const isActive = searchEngineId === engine.id;
                  const isCustom = engine.id.startsWith('custom-');
                  const favicon = engineFavicon(engine.url);
                  return (
                    <div
                      key={engine.id}
                      className={`flex items-center justify-between gap-3 px-4 py-3 ${
                        i !== 0 ? 'border-t border-[var(--border)]' : ''
                      }`}
                    >
                      <button
                        onClick={() => setSearchEngine(engine.id)}
                        className="flex flex-1 items-center gap-3.5 text-left min-w-0"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)]">
                          {favicon ? (
                            <img
                              src={favicon}
                              alt=""
                              className="h-5 w-5 rounded"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <Globe size={16} className="text-[var(--text-faint)]" />
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-[var(--text)]">
                            {engine.name}
                          </span>
                          <span className="block truncate text-xs text-[var(--text-faint)]">
                            {engine.url.split('?')[0]}
                          </span>
                        </span>
                      </button>
                      <div className="flex items-center gap-1 shrink-0">
                        {isActive && (
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent-soft)]">
                            <Check size={14} className="text-[var(--accent)]" />
                          </span>
                        )}
                        {isCustom && (
                          <button
                            onClick={() => removeCustomSearchEngine(engine.id)}
                            aria-label={`Remove ${engine.name}`}
                            className="rounded-full p-1.5 text-[var(--text-faint)] transition-colors hover:bg-[var(--hover)] hover:text-[#ef4444]"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </MdCard>

              {/* Add custom search engine */}
              {!showAdd ? (
                <button
                  onClick={() => setShowAdd(true)}
                  className="flex w-full items-center gap-2 rounded-2xl border border-dashed border-[var(--border-strong)] px-4 py-3.5 text-sm font-medium text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
                >
                  <Plus size={16} /> Add search engine
                </button>
              ) : (
                <MdCard className="space-y-3">
                  <MdField
                    value={customName}
                    onChange={setCustomName}
                    label="Name"
                    placeholder="My Search"
                  />
                  <MdField
                    value={customUrl}
                    onChange={setCustomUrl}
                    label="Search URL"
                    placeholder="https://example.com/search?q=%s"
                    onEnter={handleAddCustom}
                  />
                  {customError && (
                    <p className="text-xs text-[#ef4444]">{customError}</p>
                  )}
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      onClick={() => {
                        setShowAdd(false);
                        setCustomName('');
                        setCustomUrl('');
                        setCustomError('');
                      }}
                      className="rounded-full px-4 py-2 text-sm font-medium text-[var(--text-muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAddCustom}
                      className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
                    >
                      Add
                    </button>
                  </div>
                </MdCard>
              )}
            </div>
          )}

          {activeSection === 'appearance' && (
            <div className="space-y-8">
              {/* Theme selection */}
              <div>
                <SectionLabel>Theme</SectionLabel>
                <div className="grid grid-cols-3 gap-3">
                  {THEMES.map((t) => {
                    const Icon = t.icon;
                    const active = theme === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => setTheme(t.id)}
                        className={`flex flex-col items-center gap-2.5 rounded-2xl border px-4 py-6 transition-all duration-150 ${
                          active
                            ? 'border-transparent bg-[var(--accent-soft)] text-[var(--accent)]'
                            : 'border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--hover)]'
                        }`}
                      >
                        <Icon size={20} strokeWidth={active ? 2.4 : 2} />
                        <span className="text-sm font-medium">{t.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <SectionLabel>New tab page</SectionLabel>
                <div className="grid grid-cols-2 gap-3">
                  {(
                    [
                      {
                        id: 'minimal' as const,
                        label: 'Minimal',
                        desc: 'A static background that follows your theme (dark in dark mode, light in light mode).',
                      },
                      {
                        id: 'full' as const,
                        label: 'Full',
                        desc: 'Includes everything: a fresh Pexels background, clock, date, search and more.',
                      },
                    ]
                  ).map((m) => {
                    const active = newTabMode === m.id;
                    return (
                      <button
                        key={m.id}
                        onClick={() => setNewTabMode(m.id)}
                        className={`flex flex-col items-start gap-2 rounded-2xl border px-4 py-4 text-left transition-all duration-150 ${
                          active
                            ? 'border-transparent bg-[var(--accent-soft)]'
                            : 'border-[var(--border)] hover:bg-[var(--hover)]'
                        }`}
                      >
                        <span className="flex w-full items-center justify-between text-sm font-medium">
                          <span className={active ? 'text-[var(--accent)]' : 'text-[var(--text)]'}>{m.label}</span>
                          {active && <Check size={15} className="text-[var(--accent)]" />}
                        </span>
                        <span className="text-xs leading-snug text-[var(--text-faint)]">
                          {m.desc}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {activeSection === 'security' && (
            <div className="space-y-4">
              <MdCard padded={false}>
                {SECURITY_OPTIONS.map((opt, i) => {
                  const value = security[opt.key];
                  return (
                    <div
                      key={opt.key}
                      className={`flex items-center justify-between gap-4 px-4 py-4 ${
                        i !== 0 ? 'border-t border-[var(--border)]' : ''
                      }`}
                    >
                      <div>
                        <div className="text-sm font-medium text-[var(--text)]">{opt.label}</div>
                        <div className="mt-0.5 text-xs text-[var(--text-faint)]">{opt.desc}</div>
                      </div>
                      <MdSwitch checked={value} onChange={() => setSecurityFlag(opt.key, !value)} />
                    </div>
                  );
                })}
              </MdCard>
              <p className="px-1 text-xs text-[var(--text-faint)]">
                These protections apply wherever supported by the browsing engine.
              </p>

              {/* Live ad-blocker summary */}
              <MdCard className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className={`flex h-9 w-9 items-center justify-center rounded-full ${adblockStats.enabled ? 'bg-[var(--accent-soft)]' : 'bg-[var(--surface-2)]'}`}>
                    <Shield size={16} className={adblockStats.enabled ? 'text-[var(--accent)]' : 'text-[var(--text-faint)]'} />
                  </span>
                  <span className="text-sm font-medium text-[var(--text)]">
                    {adblockStats.enabled ? 'Ad blocker active' : 'Ad blocker off'}
                  </span>
                </div>
                <span className="text-xs text-[var(--text-faint)]">
                  {adblockStats.blocked.toLocaleString()} requests blocked
                </span>
              </MdCard>
              <p className="px-1 text-xs leading-relaxed text-[var(--text-faint)]">
                AdGuard DNS blocks known domains first. The local filter engine then blocks
                matching URLs and resource requests that DNS cannot see.
              </p>
            </div>
          )}

          {activeSection === 'proxy' && (
            <div className="space-y-4">
              {/* Toggle row */}
              <MdCard className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-[var(--text)]">Enable proxy</div>
                  <div className="mt-0.5 text-xs text-[var(--text-faint)]">
                    Route browser traffic through a configured anonymous proxy. Google uses your direct connection.
                  </div>
                </div>
                <MdSwitch
                  checked={proxyEnabled}
                  onChange={toggleProxy}
                  disabled={proxyStatus === 'fetching' || proxyStatus === 'verifying'}
                />
              </MdCard>

              {/* Status + info card */}
              {(proxyStatus === 'fetching' || proxyStatus === 'verifying') && (
                <MdCard className="flex items-center gap-3">
                  <RefreshCw size={16} className="text-[var(--accent)] animate-spin shrink-0" />
                  <span className="text-sm text-[var(--text-muted)]">
                    {proxyStatus === 'fetching' ? 'Fetching proxy…' : 'Verifying connection…'}
                  </span>
                </MdCard>
              )}

              {proxyStatus === 'failed' && proxyError && (
                <div className="flex items-center gap-3 rounded-2xl bg-red-500/10 px-4 py-3.5">
                  <AlertTriangle size={16} className="text-red-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-red-400">{proxyError}</p>
                    <p className="mt-0.5 text-xs text-[var(--text-faint)]">Configured proxies can be unreliable. Check the proxy configuration and try again.</p>
                  </div>
                </div>
              )}

              {proxyEnabled && proxy && proxyStatus === 'active' && (
                <div className="rounded-2xl bg-[var(--accent-soft)] px-4 py-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Wifi size={15} className="text-[var(--accent)]" />
                      <span className="text-sm font-medium text-[var(--text)]">Connected</span>
                    </div>
                    <button
                      onClick={fetchAndApply}
                      title="Get a new proxy"
                      className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--hover)] hover:text-[var(--text)] transition-colors"
                    >
                      <RefreshCw size={12} /> Rotate
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {[
                      { label: 'IP:Port', value: proxy.ipPort },
                      { label: 'Country', value: proxy.country },
                      { label: 'Type', value: proxy.type.toUpperCase() },
                      { label: 'Level', value: proxy.proxyLevel },
                      { label: 'HTTPS', value: proxy.supportsHttps ? 'Yes' : 'No' },
                      { label: 'Speed', value: `${proxy.speed}s` },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex justify-between rounded-xl bg-[var(--surface)] px-3 py-2">
                        <span className="text-[var(--text-faint)]">{label}</span>
                        <span className="font-medium text-[var(--text)]">{value}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-[var(--text-faint)]">
                    Last fetched {new Date(proxy.fetchedAt).toLocaleTimeString()}
                  </p>
                </div>
              )}

              {!proxyEnabled && proxyStatus !== 'fetching' && proxyStatus !== 'verifying' && (
                <MdCard className="flex items-center gap-3">
                  <WifiOff size={15} className="text-[var(--text-faint)] shrink-0" />
                  <span className="text-sm text-[var(--text-faint)]">
                    No proxy — using direct connection
                  </span>
                </MdCard>
              )}

              <p className="px-1 text-xs leading-relaxed text-[var(--text-faint)]">
                Proxies come from the local ZYPHORA_PROXY_LIST configuration. Public proxies
                may be slow, blocked by some sites, or go offline without notice. Use for
                light anonymity only — not a substitute for a VPN.
              </p>
            </div>
          )}

          {activeSection === 'downloads' && (
            <div className="space-y-4">
              {/* Save location */}
              <MdCard className="space-y-3.5">
                <div>
                  <div className="text-sm font-medium text-[var(--text)]">Save location</div>
                  <div className="mt-0.5 text-xs text-[var(--text-faint)]">
                    Files are saved here automatically — no save dialog is shown.
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    value={downloadPath}
                    onChange={(e) => setDownloadPath(e.target.value)}
                    placeholder="Default downloads folder"
                    className="flex-1 rounded-xl bg-[var(--surface-2)] px-3.5 py-2.5 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:ring-2 focus:ring-[var(--accent)]"
                  />
                  <button
                    onClick={async () => {
                      const picked = await window.browserAPI.downloads.pickFolder().catch(() => null);
                      if (picked) setDownloadPath(picked);
                    }}
                    className="flex items-center gap-1.5 rounded-full bg-[var(--surface-2)] px-4 py-2.5 text-sm font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text)]"
                  >
                    <FolderOpen size={15} /> Browse
                  </button>
                </div>
                <div className="flex items-center justify-between pt-0.5">
                  <span className="text-xs text-[var(--text-faint)]">
                    Press{' '}
                    <kbd className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-[11px] text-[var(--text-muted)]">
                      Ctrl + J
                    </kbd>{' '}
                    to open the Downloads page.
                  </span>
                  <button
                    onClick={() => window.browserAPI.downloads.revealFolder().catch(() => {})}
                    className="text-xs font-medium text-[var(--accent)] hover:underline"
                  >
                    Open folder
                  </button>
                </div>
              </MdCard>

              {/* Behaviour */}
              <MdCard className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-[var(--text)]">Open Downloads page on new download</div>
                  <div className="mt-0.5 text-xs text-[var(--text-faint)]">
                    Automatically switch to the Downloads page whenever a download starts.
                  </div>
                </div>
                <MdSwitch checked={openDownloadsOnStart} onChange={() => setOpenDownloadsOnStart(!openDownloadsOnStart)} />
              </MdCard>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

// Material-style elevated surface: flat by default, subtle shadow, 16px radius.
// `padded={false}` is used for lists whose rows carry their own padding.
function MdCard({
  children,
  className = '',
  padded = true,
}: {
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl bg-[var(--surface)] shadow-sm ${padded ? 'p-4' : ''} ${className}`}
    >
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 px-1 text-xs font-medium tracking-[0.08em] text-[var(--text-faint)]">
      {children}
    </h2>
  );
}

// Material-style outlined text field with a floating label.
function MdField({
  value,
  onChange,
  label,
  placeholder,
  onEnter,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder?: string;
  onEnter?: () => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-[var(--text-faint)]">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
        placeholder={placeholder}
        className="w-full rounded-xl bg-[var(--surface-2)] px-3.5 py-2.5 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:ring-2 focus:ring-[var(--accent)]"
      />
    </label>
  );
}