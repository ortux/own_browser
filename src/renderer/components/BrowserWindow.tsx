import React from 'react';
import { SidebarTabs } from './SidebarTabs';
import { TitleBar } from './TitleBar';
import { NavBar } from './NavBar';
import { WebView } from './WebView';
import { NewTabPage } from './NewTabPage';
import { SettingsPage } from './SettingsPage';
import { useBrowserStore } from '../stores/tabStore';
import { useBrowser } from '../hooks/useBrowser';
import { useSettingsStore } from '../stores/settingsStore';

function looksLikeUrl(input: string): boolean {
  const trimmed = input.trim();
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('file://') ||
    trimmed.startsWith('about:') ||
    trimmed.startsWith('localhost')
  ) {
    return true;
  }
  return trimmed.includes('.') && !trimmed.includes(' ');
}

export const BrowserWindow: React.FC = () => {
  const tabs = useBrowserStore((state) => state.tabs);
  const activeTabId = useBrowserStore((state) => state.activeTabId);
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const buildSearchUrl = useSettingsStore((s) => s.buildSearchUrl);

  const openSettings = () => handleNavigate('about:settings');
  const closeSettings = () => handleNavigate('about:blank');

  const {
    navigate,
    createTab,
    closeTab,
    activateTab,
    goBack,
    goForward,
    reload,
    stop,
    duplicateTab,
  } = useBrowser();

  const handleNavigate = (input: string) => {
    const trimmed = input.trim();
    if (!trimmed) return;
    // Home / blank — send as-is so the current tab resets to new tab page
    if (trimmed === 'about:blank') {
      navigate('about:blank');
      return;
    }
    const url = looksLikeUrl(trimmed) ? trimmed : buildSearchUrl(trimmed);
    navigate(url);
  };

  // Keyboard shortcuts
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 't') {
        e.preventDefault();
        createTab();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
        e.preventDefault();
        if (activeTabId) closeTab(activeTabId);
      } else if (((e.ctrlKey || e.metaKey) && e.key === 'r') || e.key === 'F5') {
        e.preventDefault();
        reload();
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'T') {
        e.preventDefault();
        duplicateTab();
      } else if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        goBack();
      } else if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        goForward();
      } else if (e.key === 'Escape') {
        if (activeTab?.url === 'about:settings') {
          closeSettings();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTabId, activeTab?.url, createTab, closeTab, reload, duplicateTab, goBack, goForward, closeSettings]);

  const isNewTab = !activeTab?.url || activeTab.url === 'about:blank';
  const isSettings = activeTab?.url === 'about:settings';

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--bg)]">

      {/* ── Left sidebar: collapsible tab panel ── */}
      <SidebarTabs
        tabs={tabs}
        activeTabId={activeTabId}
        onTabClick={activateTab}
        onTabClose={closeTab}
        onNewTab={createTab}
      />

      {/* ── Main column: title bar + content + bottom navbar ── */}
      <div className="flex flex-col flex-1 min-w-0">

        {/* Windows title bar with window controls */}
        <TitleBar />

        {/* Content area */}
        <div className="flex-1 overflow-hidden relative rounded-2xl bg-white">
          {/* Settings page */}
          {isSettings && (
            <div className="absolute inset-0">
              <SettingsPage onBack={closeSettings} />
            </div>
          )}

          {/* New tab page */}
          {isNewTab && (
            <div className="absolute inset-0">
              <NewTabPage onSearch={handleNavigate} />
            </div>
          )}

          {/* Webviews — keep all mounted, toggle visibility */}
          {tabs
            .filter((t) => t.url && t.url !== 'about:blank' && t.url !== 'about:settings')
            .map((t) => (
              <div
                key={t.id}
                className="absolute inset-0"
                style={{ display: t.id === activeTabId ? 'block' : 'none' }}
              >
                <WebView tab={t} />
              </div>
            ))}
        </div>

        {/* Bottom navigation bar */}
        <NavBar
          activeTab={activeTab}
          onBack={goBack}
          onForward={goForward}
          onReload={reload}
          onStop={stop}
          onNavigate={handleNavigate}
          onOpenSettings={openSettings}
          onHome={() => handleNavigate('about:blank')}
        />
      </div>
    </div>
  );
};
