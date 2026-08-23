import React, { useState, useEffect } from 'react';
import { ArrowLeft, Check, Image as ImageIcon, Search as SearchIcon, User, Globe, Plus, X, Shield, Sun, Moon, Monitor } from 'lucide-react';
import { useSettingsStore, SEARCH_ENGINES } from '../stores/settingsStore';
import type { BackgroundCategory } from '../lib/backgroundCache';
import type { SecuritySettings } from '../stores/settingsStore';

interface SettingsPageProps {
  onBack: () => void;
}

const CATEGORY_OPTIONS: { id: BackgroundCategory; label: string }[] = [
  { id: 'random', label: 'Random (Nature / Tech / Space)' },
  { id: 'nature', label: 'Nature' },
  { id: 'technology', label: 'Technology' },
  { id: 'space', label: 'Space' },
];

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
    backgroundCategory,
    setNewTabMode,
    setBackgroundCategory,
  } = useSettingsStore();

  const [activeSection, setActiveSection] = useState<'general' | 'search' | 'appearance' | 'security'>('general');

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

  return (
    <div className="flex h-full w-full bg-[var(--bg)] text-[var(--text)]">
      {/* Sidebar */}
      <aside className="flex w-56 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface-2)] p-4">
        <button
          onClick={onBack}
          className="mb-6 flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-[var(--text-muted)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text)]"
        >
          <ArrowLeft size={16} /> Back
        </button>

        <nav className="flex flex-col gap-1">
          {[
            { id: 'general', label: 'General', icon: User },
            { id: 'search', label: 'Search Engine', icon: SearchIcon },
            { id: 'appearance', label: 'Appearance', icon: ImageIcon },
            { id: 'security', label: 'Security', icon: Shield },
          ].map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id as typeof activeSection)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  active
                    ? 'bg-[var(--hover)] text-[var(--text)]'
                    : 'text-[var(--text-muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]'
                }`}
              >
                <Icon size={16} /> {item.label}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto px-2 text-[11px] text-[var(--text-faint)]">
          Own Browser · Settings
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-10">
        <h1 className="mb-8 text-2xl font-semibold">Settings</h1>

        {activeSection === 'general' && (
          <div className="max-w-2xl space-y-8">
            <Section title="Profile">
              <p className="text-sm text-[var(--text-muted)]">
                Account settings are not available yet. This section is reserved for
                future profile and sync features.
              </p>
            </Section>
          </div>
        )}

        {activeSection === 'search' && (
          <div className="max-w-2xl space-y-4">
            <h2 className="text-sm font-medium uppercase tracking-wide text-[var(--text-faint)]">
              Search Engine
            </h2>
            <div className="flex flex-col gap-2">
              {allEngines.map((engine) => {
                const isActive = searchEngineId === engine.id;
                const isCustom = engine.id.startsWith('custom-');
                const favicon = engineFavicon(engine.url);
                return (
                  <div
                    key={engine.id}
                    className={`flex items-center justify-between rounded-xl border px-4 py-3 transition-all ${
                      isActive
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text)]'
                        : 'border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-[var(--hover)] text-[var(--text-muted)]'
                    }`}
                  >
                    <button
                      onClick={() => setSearchEngine(engine.id)}
                      className="flex flex-1 items-center gap-3 text-left"
                    >
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
                        <Globe size={18} className="shrink-0 text-[var(--text-faint)]" />
                      )}
                      <span className="font-medium">{engine.name}</span>
                      <span className="truncate text-xs text-[var(--text-faint)]">
                        {engine.url.split('?')[0]}
                      </span>
                    </button>
                    <div className="flex items-center gap-2">
                      {isActive && <Check size={16} className="shrink-0 text-[var(--accent)]" />}
                      {isCustom && (
                        <button
                          onClick={() => removeCustomSearchEngine(engine.id)}
                          aria-label={`Remove ${engine.name}`}
                          className="rounded-lg p-1.5 text-[var(--text-faint)] transition-colors hover:bg-[var(--hover)] hover:text-[#ef4444]"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Add custom search engine */}
            {!showAdd ? (
              <button
                onClick={() => setShowAdd(true)}
                className="flex items-center gap-2 rounded-xl border border-dashed border-[var(--border-strong)] px-4 py-3 text-sm text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                <Plus size={16} /> Add your own search engine
              </button>
            ) : (
              <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                <input
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="Name (e.g. My Search)"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--accent)]"
                />
                <input
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddCustom()}
                  placeholder="https://example.com/search?q=%s"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--accent)]"
                />
                {customError && (
                  <p className="text-xs text-[#ef4444]">{customError}</p>
                )}
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => {
                      setShowAdd(false);
                      setCustomName('');
                      setCustomUrl('');
                      setCustomError('');
                    }}
                    className="rounded-lg px-3 py-1.5 text-xs uppercase tracking-wide text-[var(--text-muted)] hover:text-[var(--text)]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddCustom}
                    className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs uppercase tracking-wide text-white transition-opacity hover:opacity-90"
                  >
                    Add
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeSection === 'appearance' && (
          <div className="max-w-2xl space-y-6">
            {/* Theme selection */}
            <div>
              <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-[var(--text-faint)]">
                Theme
              </h2>
              <div className="grid grid-cols-3 gap-3">
                {THEMES.map((t) => {
                  const Icon = t.icon;
                  const active = theme === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setTheme(t.id)}
                      className={`flex flex-col items-center gap-2 rounded-xl border px-4 py-6 transition-all ${
                        active
                          ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text)]'
                          : 'border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-[var(--hover)] text-[var(--text-muted)]'
                      }`}
                    >
                      <Icon size={22} />
                      <span className="text-sm font-medium">{t.label}</span>
                      {active && <Check size={14} className="text-[var(--accent)]" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <h2 className="text-sm font-medium uppercase tracking-wide text-[var(--text-faint)]">
              New Tab Page
            </h2>

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
                    className={`flex flex-col items-start gap-2 rounded-xl border px-4 py-5 text-left transition-all ${
                      active
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text)]'
                        : 'border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-[var(--hover)] text-[var(--text-muted)]'
                    }`}
                  >
                    <span className="flex w-full items-center justify-between text-sm font-medium">
                      {m.label}
                      {active && <Check size={15} className="text-[var(--accent)]" />}
                    </span>
                    <span className="text-xs leading-snug text-[var(--text-faint)]">
                      {m.desc}
                    </span>
                  </button>
                );
              })}
            </div>

            {newTabMode === 'full' && (
              <>
                <h2 className="mt-6 text-sm font-medium uppercase tracking-wide text-[var(--text-faint)]">
                  Background Category
                </h2>
                <div className="flex flex-col gap-2">
                  {CATEGORY_OPTIONS.map((opt) => {
                    const isActive = backgroundCategory === opt.id;
                    return (
                      <button
                        key={opt.id}
                        onClick={() => setBackgroundCategory(opt.id)}
                        className={`flex items-center justify-between rounded-xl border px-4 py-2.5 text-left transition-all ${
                          isActive
                            ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text)]'
                            : 'border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-[var(--hover)] text-[var(--text-muted)]'
                        }`}
                      >
                        <span className="text-sm font-medium">{opt.label}</span>
                        {isActive && (
                          <Check size={16} className="shrink-0 text-[var(--accent)]" />
                        )}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-3 text-xs text-[var(--text-faint)]">
                  Images are fetched from Pexels and preloaded so each new tab appears
                  instantly.
                </p>
              </>
            )}
          </div>
        )}

        {activeSection === 'security' && (
          <div className="max-w-2xl space-y-3">
            <h2 className="text-sm font-medium uppercase tracking-wide text-[var(--text-faint)]">
              Security &amp; Privacy
            </h2>
            <div className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
              {SECURITY_OPTIONS.map((opt) => {
                const value = security[opt.key];
                return (
                  <div
                    key={opt.key}
                    className="flex items-center justify-between gap-4 px-4 py-3.5"
                  >
                    <div>
                      <div className="text-sm text-[var(--text)]">{opt.label}</div>
                      <div className="text-xs text-[var(--text-faint)]">{opt.desc}</div>
                    </div>
                    <button
                      role="switch"
                      aria-checked={value}
                      onClick={() => setSecurityFlag(opt.key, !value)}
                      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                        value ? 'bg-[var(--accent)]' : 'bg-[var(--border-strong)]'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                          value ? 'translate-x-5' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-[var(--text-faint)]">
              These protections apply wherever supported by the browsing engine.
            </p>
          </div>
        )}
      </main>
    </div>
  );
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-[var(--text-faint)]">
        {title}
      </h2>
      {children}
    </div>
  );
}
