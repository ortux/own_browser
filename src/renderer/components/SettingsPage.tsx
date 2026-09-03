/**
 * SettingsPage.tsx — the Settings shell.
 *
 * A persistent category sidebar on the left, a scrollable content column on
 * the right, and a search field that indexes every setting in the application.
 * The shell owns navigation only; each section is a self-contained panel.
 */

import React from 'react';
import { Menu, Search as SearchIcon, X } from 'lucide-react';
import { useSettingsStore } from '../stores/settingsStore';
import type { AuthPortalMode } from './AuthPortal';
import { AgentSettingsPage } from './agent/AgentSettingsPage';
import { GeneralPage } from './settings/GeneralPage';
import {
  AboutPanel,
  ClearDataPanel,
  DownloadsPanel,
  ExtensionsPanel,
  PasswordsPanel,
  PerformancePanel,
  PrivacyPanel,
  SearchEnginesPanel,
  SecurityPanel,
  SitePermissionsPanel,
  SyncPanel,
  UpdatesPanel,
} from './settings/panels';
import {
  NAV_GROUPS,
  SECTION_LABELS,
  findNavItem,
  searchSettings,
  type SectionId,
  type SearchEntry,
} from './settings/nav';

interface SettingsPageProps {
  onOpenAuth: (mode: AuthPortalMode) => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ onOpenAuth }) => {
  const [section, setSection] = React.useState<SectionId>('general');
  const [anchor, setAnchor] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState('');
  const [resultIndex, setResultIndex] = React.useState(0);
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const browserMode = useSettingsStore((s) => s.browserMode);
  const theme = useSettingsStore((s) => s.theme);
  const contentRef = React.useRef<HTMLElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);

  const results = React.useMemo(() => searchSettings(query), [query]);
  const searching = results.length > 0 && query.trim().length >= 2;

  // The theme is applied here because Settings is the only place it can be
  // changed; keeping the effect next to the control avoids a second owner.
  React.useEffect(() => {
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

  // Ctrl/Cmd+F inside Settings searches settings, not the page.
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const goTo = React.useCallback((id: SectionId, targetAnchor?: string) => {
    const item = findNavItem(id);
    // Some sidebar entries are views onto a part of the General page rather
    // than pages of their own; send those to General with the right anchor.
    if (item.generalAnchor) {
      setSection('general');
      setAnchor(item.generalAnchor);
    } else {
      setSection(id);
      setAnchor(targetAnchor ?? null);
    }
    setSidebarOpen(false);
    contentRef.current?.scrollTo({ top: 0 });
  }, []);

  const openResult = React.useCallback((entry: SearchEntry) => {
    setSection(entry.section);
    setAnchor(entry.anchor ?? null);
    setQuery('');
    setSidebarOpen(false);
    searchRef.current?.blur();
  }, []);

  React.useEffect(() => setResultIndex(0), [query]);

  const currentItem = findNavItem(section);
  const agentSection = currentItem.agentSection;

  const activeNavId: SectionId = (() => {
    // When General is showing an anchored area, keep that sidebar row lit.
    if (section !== 'general' || !anchor) return section;
    const match = NAV_GROUPS.flatMap((group) => group.items).find(
      (item) => item.generalAnchor === anchor
    );
    return match?.id ?? 'general';
  })();

  const sidebar = (
    <nav
      aria-label="Settings categories"
      className="flex h-full w-64 shrink-0 flex-col overflow-y-auto border-r border-[var(--border)] bg-[var(--surface)] px-3 py-4"
    >
      <h1 className="px-3 pb-3 text-[17px] font-medium text-[var(--text)]">Settings</h1>

      <div className="relative mb-4 px-1">
        <SearchIcon
          size={14}
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-faint)]"
        />
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (!searching) return;
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setResultIndex((i) => Math.min(i + 1, results.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setResultIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              openResult(results[resultIndex]);
            } else if (e.key === 'Escape') {
              setQuery('');
            }
          }}
          placeholder="Search settings"
          aria-label="Search settings"
          className="w-full rounded-md bg-[var(--surface-2)] py-2 pl-8 pr-3 text-[13px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:ring-2 focus:ring-[var(--accent)] [&::-webkit-search-cancel-button]:hidden"
        />
      </div>

      {NAV_GROUPS.map((group) => {
        // The agent is a full-mode feature: hide the whole category rather
        // than showing rows that cannot do anything.
        const items = group.items.filter((item) => browserMode === 'full' || !item.agentSection);
        if (items.length === 0) return null;
        return (
          <div key={group.title} className="mb-4">
            <h2 className="px-3 pb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-faint)]">
              {group.title}
            </h2>
            <ul className="flex flex-col gap-0.5">
              {items.map((item) => {
                const Icon = item.icon;
                const active = activeNavId === item.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => goTo(item.id)}
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
          </div>
        );
      })}

      <div className="mt-auto px-3 pt-4 text-[11px] text-[var(--text-faint)]">Zyphora</div>
    </nav>
  );

  return (
    <div className="flex h-full w-full overflow-hidden bg-[var(--bg)] text-[var(--text)]">
      {/* Sidebar: persistent on desktop, a drawer in narrow windows. */}
      <div className="hidden lg:flex">{sidebar}</div>
      {sidebarOpen && (
        <div className="absolute inset-0 z-30 flex lg:hidden">
          <div className="shadow-[var(--shadow-overlay)]">{sidebar}</div>
          <button
            type="button"
            aria-label="Close settings navigation"
            onClick={() => setSidebarOpen(false)}
            className="flex-1 bg-black/40"
          />
        </div>
      )}

      <main ref={contentRef} className="relative h-full min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl px-6 py-8 sm:px-10">
          {/* Narrow-window header: sidebar toggle + inline search. */}
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open settings navigation"
              className="rounded-md border border-[var(--border)] p-2 text-[var(--text-muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]"
            >
              <Menu size={16} />
            </button>
            <span className="text-[15px] font-medium">{SECTION_LABELS[section]}</span>
          </div>

          {searching ? (
            <div>
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-[20px] font-normal leading-tight">
                  {results.length} {results.length === 1 ? 'result' : 'results'} for “{query.trim()}
                  ”
                </h2>
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12.5px] text-[var(--text-muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]"
                >
                  <X size={13} /> Clear
                </button>
              </div>
              <ul className="overflow-hidden rounded-md bg-[var(--surface)] shadow-sm">
                {results.map((entry, index) => (
                  <li key={`${entry.section}-${entry.title}`}>
                    <button
                      type="button"
                      onClick={() => openResult(entry)}
                      onMouseEnter={() => setResultIndex(index)}
                      className={`flex w-full flex-col items-start gap-1 border-b border-[var(--border)] px-4 py-3 text-left last:border-b-0 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus-ring)] ${
                        index === resultIndex ? 'bg-[var(--hover)]' : ''
                      }`}
                    >
                      <span className="text-[14px] text-[var(--text)]">{entry.title}</span>
                      <span className="text-[12.5px] leading-relaxed text-[var(--text-muted)]">
                        {entry.description}
                      </span>
                      <span className="mt-0.5 text-[11px] uppercase tracking-[0.07em] text-[var(--text-faint)]">
                        {SECTION_LABELS[entry.section]}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : query.trim().length >= 2 ? (
            <div className="rounded-md bg-[var(--surface)] px-4 py-10 text-center shadow-sm">
              <p className="text-[14px] text-[var(--text)]">No settings match “{query.trim()}”</p>
              <p className="mt-1 text-[12.5px] text-[var(--text-muted)]">
                Try a shorter word, such as “download”, “tab” or “language”.
              </p>
            </div>
          ) : section === 'general' ? (
            <GeneralPage
              focusAnchor={anchor}
              onAnchorHandled={() => setAnchor(null)}
              onOpenClearData={() => goTo('clear-data')}
              onOpenSearchEngines={() => goTo('search')}
            />
          ) : agentSection ? (
            <AgentSettingsPage initialSection={agentSection} />
          ) : (
            <div className="max-w-3xl pb-20">
              {section === 'search' && <SearchEnginesPanel />}
              {section === 'privacy' && <PrivacyPanel />}
              {section === 'security' && <SecurityPanel />}
              {section === 'permissions' && <SitePermissionsPanel />}
              {section === 'passwords' && <PasswordsPanel />}
              {section === 'clear-data' && <ClearDataPanel />}
              {section === 'downloads' && <DownloadsPanel />}
              {section === 'extensions' && <ExtensionsPanel />}
              {section === 'sync' && <SyncPanel onOpenAuth={onOpenAuth} />}
              {section === 'performance' && <PerformancePanel />}
              {section === 'updates' && <UpdatesPanel />}
              {section === 'about' && <AboutPanel />}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
