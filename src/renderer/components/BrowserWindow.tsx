import React, { useState, useCallback } from 'react';
import { SidebarTabs } from './SidebarTabs';
import { TitleBar } from './TitleBar';
import { NavBar } from './NavBar';
import { WebView } from './WebView';
import { NewTabPage } from './NewTabPage';
import { SettingsPage } from './SettingsPage';
import { HistoryPanel } from './HistoryPanel';
import { BookmarksPanel } from './BookmarksPanel';
import { useBrowserStore } from '../stores/tabStore';
import { useBrowser } from '../hooks/useBrowser';
import { useSettingsStore } from '../stores/settingsStore';
import { useBookmarks } from '../hooks/useBookmarks';

function looksLikeUrl(input: string): boolean {
  const trimmed = input.trim();
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('file://') ||
    trimmed.startsWith('about:') ||
    trimmed.startsWith('localhost')
  ) return true;
  return trimmed.includes('.') && !trimmed.includes(' ');
}

type Panel = 'history' | 'bookmarks' | null;

export const BrowserWindow: React.FC = () => {
  const tabs        = useBrowserStore((s) => s.tabs);
  const activeTabId = useBrowserStore((s) => s.activeTabId);
  const activeTab   = tabs.find((t) => t.id === activeTabId);
  const buildSearchUrl = useSettingsStore((s) => s.buildSearchUrl);
  const blockTrackers = useSettingsStore((s) => s.security.blockTrackers);

  // ── UI state ──
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [panel, setPanel]               = useState<Panel>(null);
  const togglePanel = (p: Panel) => setPanel((cur) => (cur === p ? null : p));

  const { toggle: toggleBookmark, isBookmarked } = useBookmarks();

  const {
    navigate, createTab, closeTab, activateTab,
    goBack, goForward, reload, stop, duplicateTab,
  } = useBrowser();
  const reorderTabs = useBrowserStore((s) => s.reorderTabs);

  // ── Navigation ── (defined before any callback that calls it)
  const handleNavigate = useCallback((input: string) => {
    const trimmed = input.trim();
    if (!trimmed) return;
    if (trimmed === 'about:blank') { navigate('about:blank'); return; }
    navigate(looksLikeUrl(trimmed) ? trimmed : buildSearchUrl(trimmed));
  }, [navigate, buildSearchUrl]);

  const handleBookmarkToggle = useCallback(() => {
    if (!activeTab?.url || activeTab.url.startsWith('about:')) return;
    toggleBookmark(activeTab.url, activeTab.title, activeTab.favicon);
  }, [activeTab, toggleBookmark]);

  // ── Keyboard shortcuts ──
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 't') {
        e.preventDefault(); createTab();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
        e.preventDefault(); if (activeTabId) closeTab(activeTabId);
      } else if (((e.ctrlKey || e.metaKey) && e.key === 'r') || e.key === 'F5') {
        e.preventDefault(); reload();
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'T') {
        e.preventDefault(); duplicateTab();
      } else if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault(); goBack();
      } else if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault(); goForward();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault(); handleBookmarkToggle();
      } else if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault(); setSettingsOpen(true);
      } else if (e.key === 'Escape') {
        if (settingsOpen) { setSettingsOpen(false); return; }
        if (panel) { setPanel(null); return; }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeTabId, panel, settingsOpen, createTab, closeTab, reload,
      duplicateTab, goBack, goForward, handleBookmarkToggle]);

  const isNewTab = !activeTab?.url || activeTab.url === 'about:blank';

  // ── Keep the inbuilt ad blocker in sync with the security setting ──
  React.useEffect(() => {
    window.browserAPI.adblock.set(blockTrackers).catch(() => {});
  }, [blockTrackers]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--bg)]">

      {/* Left sidebar */}
      <SidebarTabs
        tabs={tabs}
        activeTabId={activeTabId}
        onTabClick={activateTab}
        onTabClose={closeTab}
        onTabReorder={reorderTabs}
        onNewTab={createTab}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenHistory={() => togglePanel('history')}
        onOpenBookmarks={() => togglePanel('bookmarks')}
      />

      {/* Main column */}
      <div className="flex flex-col flex-1 min-w-0">
        <TitleBar />

        {/* Content row */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* Browser + navbar */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <div className="flex-1 overflow-hidden relative bg-[var(--bg)]">

              {/* Settings — full page, sits on top like chrome://settings */}
              {settingsOpen && (
                <div className="absolute inset-0 z-20 flex overflow-hidden bg-[var(--bg)]">
                  <SettingsPage onBack={() => setSettingsOpen(false)} />
                </div>
              )}

              {/* New tab page */}
              {!settingsOpen && isNewTab && (
                <div className="absolute inset-0">
                  <NewTabPage onSearch={handleNavigate} />
                </div>
              )}

              {/* Webviews — all mounted, visibility toggled */}
              {tabs
                .filter((t) => t.url && t.url !== 'about:blank')
                .map((t) => (
                  <div key={t.id} className="absolute inset-0 w-full h-full"
                    style={{ display: !settingsOpen && t.id === activeTabId ? 'flex' : 'none' }}>
                    <WebView tab={t} />
                  </div>
                ))}
            </div>

            <NavBar
              activeTab={activeTab}
              onBack={goBack}
              onForward={goForward}
              onReload={reload}
              onStop={stop}
              onNavigate={handleNavigate}
              onOpenSettings={() => setSettingsOpen(true)}
              onHome={() => handleNavigate('about:blank')}
              onBookmark={handleBookmarkToggle}
              isBookmarked={activeTab?.url ? isBookmarked(activeTab.url) : false}
            />
          </div>

          {/* Side panel — History or Bookmarks */}
          {panel === 'history' && (
            <div className="w-72 shrink-0 flex flex-col border-l border-[var(--border)] overflow-hidden">
              <HistoryPanel
                onNavigate={(url) => { handleNavigate(url); setPanel(null); }}
                onClose={() => setPanel(null)}
              />
            </div>
          )}
          {panel === 'bookmarks' && (
            <div className="w-72 shrink-0 flex flex-col border-l border-[var(--border)] overflow-hidden">
              <BookmarksPanel
                onNavigate={(url) => { handleNavigate(url); setPanel(null); }}
                onClose={() => setPanel(null)}
              />
            </div>
          )}
        </div>
      </div>

    </div>
  );
};
