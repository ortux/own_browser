import React, { useState, useCallback, useEffect, useRef } from 'react';
import { SidebarTabs } from './SidebarTabs';
import { TitleBar } from './TitleBar';
import { NavBar } from './NavBar';
import { WebView } from './WebView';
import { NewTabPage } from './NewTabPage';
import { SettingsPage } from './SettingsPage';
import { DownloadsPage } from './DownloadsPage';
import { DownloadToast } from './DownloadToast';
import { HistoryPanel } from './HistoryPanel';
import { BookmarksPanel } from './BookmarksPanel';
import { FindBar } from './FindBar';
import { RecentlyClosedPanel } from './RecentlyClosedPanel';
import { HistoryPage } from './HistoryPage';
import { DiagnosticsPage } from './DiagnosticsPage';
import { CommandPalette } from './CommandPalette';
import { ShortcutCheatsheet } from './ShortcutCheatsheet';
import { ClearBrowsingDataDialog } from './ClearBrowsingDataDialog';
import { useBrowserStore } from '../stores/tabStore';
import { useBrowser } from '../hooks/useBrowser';
import { useSettingsStore, SEARCH_ENGINES } from '../stores/settingsStore';
import { useBookmarks } from '../hooks/useBookmarks';
import { resolveAddressInput } from '../lib/addressInput';
import { internalPageTitle } from '../../shared/navigation';

type Panel = 'history' | 'bookmarks' | 'closed' | null;

/** Idle time before a background tab's webview is unmounted (memory). */
const TAB_SLEEP_AFTER_MS = 5 * 60_000;
const TAB_SLEEP_CHECK_INTERVAL_MS = 30_000;

/** Placeholder shown while a tab is discarded. Click reloads the page. */
const SleepPlaceholder: React.FC<{ title: string; onWake: () => void }> = ({ title, onWake }) => (
  <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[var(--bg)] text-[var(--text-faint)]">
    <div className="text-3xl" aria-hidden>💤</div>
    <p className="text-sm">
      “{title}” was put to sleep to save memory.
    </p>
    <button
      onClick={onWake}
      className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm text-white hover:opacity-90 transition-opacity"
    >
      Wake tab
    </button>
  </div>
);

export const BrowserWindow: React.FC = () => {
  const tabs        = useBrowserStore((s) => s.tabs);
  const activeTabId = useBrowserStore((s) => s.activeTabId);
  const activeTab   = tabs.find((t) => t.id === activeTabId);
  const searchEngineId = useSettingsStore((s) => s.searchEngineId);
  const customSearchEngines = useSettingsStore((s) => s.customSearchEngines);
  const blockTrackers = useSettingsStore((s) => s.security.blockTrackers);
  const adblockAllowlist = useSettingsStore((s) => s.adblockAllowlist);
  const forceHttps = useSettingsStore((s) => s.security.forceHttps);
  const doNotTrack = useSettingsStore((s) => s.security.doNotTrack);
  const globalPrivacyControl = useSettingsStore((s) => s.security.globalPrivacyControl);
  const stripTrackingParamsSetting = useSettingsStore((s) => s.security.stripTrackingParams);
  const webrtcPolicy = useSettingsStore((s) => s.security.webrtcPolicy);
  const blockThirdPartyCookies = useSettingsStore((s) => s.security.blockThirdPartyCookies);
  const privateByDefault = useSettingsStore((s) => s.security.privateByDefault);
  const restoreSession = useSettingsStore((s) => s.restoreSession);
  const downloadRetentionDays = useSettingsStore((s) => s.downloadRetentionDays);
  const savedProxy = useSettingsStore((s) => s.proxy);
  const savedDownloadPath = useSettingsStore((s) => s.downloadPath);
  const proxyEnabled = useSettingsStore((s) => s.proxyEnabled);
  const setProxy = useSettingsStore((s) => s.setProxy);
  const setProxyEnabled = useSettingsStore((s) => s.setProxyEnabled);

  // ── UI state ──
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [panel, setPanel]               = useState<Panel>(null);
  const togglePanel = (p: Panel) => setPanel((cur) => (cur === p ? null : p));
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [cheatsheetOpen, setCheatsheetOpen] = useState(false);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);

  // ── Tab sleeping ──
  const [asleepTabs, setAsleepTabs] = useState<Set<string>>(() => new Set());
  const lastActiveRef = useRef<Map<string, number>>(new Map());
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const activeTabIdRef = useRef(activeTabId);
  activeTabIdRef.current = activeTabId;

  useEffect(() => {
    const now = Date.now();
    const map = lastActiveRef.current;
    for (const tab of tabs) {
      if (!map.has(tab.id)) map.set(tab.id, now);
    }
    const ids = new Set(tabs.map((tab) => tab.id));
    for (const id of map.keys()) {
      if (!ids.has(id)) map.delete(id);
    }
    setAsleepTabs((current) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of current) {
        if (ids.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : current;
    });
  }, [tabs]);

  useEffect(() => {
    if (!activeTabId) return;
    lastActiveRef.current.set(activeTabId, Date.now());
    setAsleepTabs((current) => {
      if (!current.has(activeTabId)) return current;
      const next = new Set(current);
      next.delete(activeTabId);
      return next;
    });
  }, [activeTabId]);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      const currentActive = activeTabIdRef.current;
      const toSleep = tabsRef.current.filter((tab) =>
        tab.id !== currentActive
        && !tab.pinned
        && !tab.audible
        && tab.url !== 'about:blank'
        && !tab.url.startsWith('zyphora://')
        && now - (lastActiveRef.current.get(tab.id) ?? now) > TAB_SLEEP_AFTER_MS
      );
      if (toSleep.length === 0) return;
      setAsleepTabs((current) => {
        const next = new Set(current);
        for (const tab of toSleep) next.add(tab.id);
        return next;
      });
    }, TAB_SLEEP_CHECK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  const wakeTab = useCallback((tabId: string) => {
    setAsleepTabs((current) => {
      if (!current.has(tabId)) return current;
      const next = new Set(current);
      next.delete(tabId);
      return next;
    });
    lastActiveRef.current.set(tabId, Date.now());
  }, []);

  const { toggle: toggleBookmark, isBookmarked } = useBookmarks();

  const {
    navigate, createTab, createTabWithUrl, closeTab, activateTab,
    goBack, goForward, reload, stop, restoreClosedTab, zoom, resetZoom, printPage,
  } = useBrowser();
  const createNewBrowserTab = useCallback(
    () => createTab(privateByDefault),
    [createTab, privateByDefault]
  );
  const reorderTabs = useBrowserStore((s) => s.reorderTabs);

  // ── Navigation ── (defined before any callback that calls it)
  const handleNavigate = useCallback((input: string) => {
    const trimmed = input.trim();
    if (!trimmed) return;
    if (trimmed === 'about:blank') { navigate('about:blank'); return; }
    // Shared resolver handles URLs, "<keyword> query" engine shortcuts, and
    // search queries identically to the address bar.
    const resolved = resolveAddressInput(
      trimmed,
      [...SEARCH_ENGINES, ...customSearchEngines],
      searchEngineId,
      (engine, query) => engine.url.replace(/%s/g, encodeURIComponent(query)),
    );
    if (!resolved.url) return;
    const secureDestination = forceHttps && resolved.url.startsWith('http://')
      ? `https://${resolved.url.slice('http://'.length)}`
      : resolved.url;
    navigate(secureDestination);
  }, [navigate, searchEngineId, customSearchEngines, forceHttps]);

  const handleBookmarkToggle = useCallback(() => {
    if (!activeTab?.url || activeTab.url.startsWith('about:')) return;
    void toggleBookmark(activeTab.url, activeTab.title, activeTab.favicon).catch((error: unknown) => {
      console.error('[bookmarks] failed to toggle bookmark:', error);
    });
  }, [activeTab, toggleBookmark]);

  React.useEffect(() => window.browserAPI.onOpenFind(() => setFindOpen(true)), []);

  // handleNavigate may change (engine/HTTPS settings); keep a stable ref for
  // the long-lived context-search listener below.
  const handleNavigateRef = useRef(handleNavigate);
  handleNavigateRef.current = handleNavigate;

  // Raised by the main process when a webview has keyboard focus and the
  // shortcut can't reach the renderer's window listener.
  React.useEffect(() => {
    const unsubs = [
      window.browserAPI.onFocusAddress(() => {
        window.dispatchEvent(new Event('zyphora:focus-address'));
      }),
      window.browserAPI.onOpenPalette(() => setPaletteOpen(true)),
      window.browserAPI.onContextSearch((selection) => {
        handleNavigateRef.current(selection);
      }),
    ];
    return () => unsubs.forEach((unsub) => unsub());
  }, []);

  // ── Keyboard shortcuts ──
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const control = e.ctrlKey || e.metaKey;
      if (control && e.key === 'Tab') {
        e.preventDefault(); void window.browserAPI.tabs.cycle(!e.shiftKey);
      } else if (control && /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        const index = e.key === '9' ? tabs.length - 1 : Number(e.key) - 1;
        const target = tabs[index];
        if (target) activateTab(target.id);
      } else if (control && !e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        window.dispatchEvent(new Event('zyphora:focus-address'));
      } else if (control && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault(); setPaletteOpen((v) => !v);
      } else if (control && e.key === '/') {
        e.preventDefault(); setCheatsheetOpen((v) => !v);
      } else if (e.key === 'F11') {
        e.preventDefault(); window.browserAPI.toggleFullscreen();
      } else if (control && !e.shiftKey && e.key === 't') {
        e.preventDefault(); createNewBrowserTab();
      } else if (control && e.key === 'w') {
        e.preventDefault(); if (activeTabId) closeTab(activeTabId);
      } else if ((control && e.key === 'r') || e.key === 'F5') {
        e.preventDefault(); reload();
      } else if (control && (e.key === '+' || e.key === '=')) {
        e.preventDefault(); zoom(0.1);
      } else if (control && e.key === '-') {
        e.preventDefault(); zoom(-0.1);
      } else if (control && e.key === '0') {
        e.preventDefault(); resetZoom();
      } else if (control && e.key === 'p') {
        e.preventDefault(); printPage();
      } else if (control && e.shiftKey && e.key === 'T') {
        e.preventDefault(); restoreClosedTab();
      } else if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault(); goBack();
      } else if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault(); goForward();
      } else if (control && e.key === 'd') {
        e.preventDefault(); handleBookmarkToggle();
      } else if (control && e.key === 'f') {
        e.preventDefault(); setFindOpen(true);
      } else if (control && e.key === ',') {
        e.preventDefault(); setSettingsOpen(true);
      } else if (e.key === 'Escape') {
        if (paletteOpen) { setPaletteOpen(false); return; }
        if (cheatsheetOpen) { setCheatsheetOpen(false); return; }
        if (clearDialogOpen) { setClearDialogOpen(false); return; }
        if (findOpen) { setFindOpen(false); return; }
        if (settingsOpen) { setSettingsOpen(false); return; }
        if (panel) { setPanel(null); return; }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeTabId, tabs, findOpen, panel, settingsOpen, paletteOpen, cheatsheetOpen, clearDialogOpen,
       createNewBrowserTab, createTabWithUrl, closeTab, reload, activateTab,
       restoreClosedTab, zoom, resetZoom, printPage, goBack, goForward, handleBookmarkToggle]);

  const isNewTab = !activeTab?.url || activeTab.url === 'about:blank';
  const isDownloads = activeTab?.url === 'zyphora://downloads';
  const isHistory = activeTab?.url === 'zyphora://history';
  const isDiagnostics = activeTab?.url === 'zyphora://diagnostics';

  // Keep internal pages showing a friendly tab title (the webview never loads
  // them, so main never receives a real title for zyphora:// URLs).
  React.useEffect(() => {
    if (!activeTab || !activeTab.url.startsWith('zyphora://')) return;
    const friendly = internalPageTitle(activeTab.url);
    if (friendly && activeTab.title !== friendly) {
      window.browserAPI.sendMessage({
        type: 'webview-title-updated',
        tabId: activeTab.id,
        title: friendly,
      });
    }
  }, [activeTab?.id, activeTab?.url, activeTab?.title]);

  // Keep network security settings in sync with the main process before a
  // renderer-initiated navigation can happen.
  React.useEffect(() => {
    window.browserAPI.security.set({
      forceHttps,
      doNotTrack,
      globalPrivacyControl,
      stripTrackingParams: stripTrackingParamsSetting,
      webrtcPolicy,
      blockThirdPartyCookies,
    }).catch(() => {});
  }, [forceHttps, doNotTrack, globalPrivacyControl, stripTrackingParamsSetting, webrtcPolicy, blockThirdPartyCookies]);

  // "Continue where you left off" — stored main-side so restore can happen
  // before the renderer loads.
  React.useEffect(() => {
    window.browserAPI.session.setRestore(restoreSession).catch(() => {});
  }, [restoreSession]);

  // Download history retention (days).
  React.useEffect(() => {
    window.browserAPI.downloads.setRetention(downloadRetentionDays).catch(() => {});
  }, [downloadRetentionDays]);

  // The initial tab is created by the main process before the renderer can read
  // persisted settings. Mark it private while it is still a blank page so the
  // setting applies to the first tab as well.
  React.useEffect(() => {
    if (privateByDefault && activeTab?.url === 'about:blank' && !activeTab.privateMode) {
      window.browserAPI.sendMessage({
        type: 'set-tab-private',
        tabId: activeTab.id,
        privateMode: true,
      }).catch(() => {});
    }
  }, [activeTab?.id, activeTab?.url, activeTab?.privateMode, privateByDefault]);

  // Keep the network blocker and its per-site exception list in sync with
  // persisted renderer settings.
  React.useEffect(() => {
    window.browserAPI.adblock.set(blockTrackers).catch(() => {});
  }, [blockTrackers]);
  React.useEffect(() => {
    window.browserAPI.adblock.setAllowlist(adblockAllowlist).catch(() => {});
  }, [adblockAllowlist]);

  React.useEffect(() => {
    if (!savedDownloadPath) return;
    window.browserAPI.downloads.setPath(savedDownloadPath).catch(() => {
      // Keep the main process on its safe OS default until the user chooses a
      // valid directory again in Settings.
    });
  }, [savedDownloadPath]);

  // A persisted proxy must be restored before the first webview navigation.
  // Otherwise the UI says it is active while the main process is still direct;
  // worse, a dead saved proxy can make every new link look like a black tab.
  const proxyRestoreAttempted = React.useRef(false);
  React.useEffect(() => {
    if (!proxyEnabled || !savedProxy || proxyRestoreAttempted.current) return;
    proxyRestoreAttempted.current = true;

    void (async () => {
      try {
        await window.browserAPI.proxy.apply(savedProxy);
        if (!(await window.browserAPI.proxy.verify(savedProxy))) {
          throw new Error('saved proxy did not respond');
        }
      } catch {
        await window.browserAPI.proxy.clear().catch(() => {});
        setProxy(null);
        setProxyEnabled(false);
      }
    })();
  }, [proxyEnabled, savedProxy, setProxy, setProxyEnabled]);

  // ── Optionally open the Downloads page when a new download begins ──
  const openDownloadsOnStart = useSettingsStore((s) => s.openDownloadsOnStart);
  React.useEffect(() => {
    if (!window.browserAPI?.downloads?.onStarted) return;
    const unsub = window.browserAPI.downloads.onStarted(() => {
      if (openDownloadsOnStart) createTabWithUrl('zyphora://downloads');
    });
    return unsub;
  }, [openDownloadsOnStart, createTabWithUrl]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--bg)]">

      {/* Left sidebar */}
      <SidebarTabs
        tabs={tabs}
        activeTabId={activeTabId}
        onTabClick={activateTab}
        onTabClose={closeTab}
        onTabReorder={reorderTabs}
        onNewTab={createNewBrowserTab}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenHistory={() => createTabWithUrl('zyphora://history')}
        onOpenBookmarks={() => togglePanel('bookmarks')}
        onOpenRecentlyClosed={() => togglePanel('closed')}
        onTabTogglePin={(tabId) => {
          const tab = tabs.find((t) => t.id === tabId);
          if (tab) void window.browserAPI.tabs.setPinned(tabId, !tab.pinned);
        }}
        onTabToggleMute={(tabId) => {
          const tab = tabs.find((t) => t.id === tabId);
          if (tab) void window.browserAPI.tabs.setMuted(tabId, !tab.muted);
        }}
      />

      {/* Main column */}
      <div className="flex flex-col flex-1 min-w-0">
        <TitleBar />

        {/* Content row */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* Browser + navbar */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <div className="flex-1 overflow-hidden relative bg-[var(--bg)]">
              {findOpen && !settingsOpen && (
                <FindBar tabId={activeTabId || undefined} onClose={() => setFindOpen(false)} />
              )}

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

              {/* Downloads page (zyphora://downloads) */}
              {!settingsOpen && isDownloads && (
                <div className="absolute inset-0">
                  <DownloadsPage />
                </div>
              )}

              {/* History page (zyphora://history) */}
              {!settingsOpen && isHistory && (
                <div className="absolute inset-0">
                  <HistoryPage
                    onBack={() => handleNavigate('about:blank')}
                    onNavigate={(url) => handleNavigate(url)}
                  />
                </div>
              )}

              {/* Diagnostics page (zyphora://diagnostics) */}
              {!settingsOpen && isDiagnostics && (
                <div className="absolute inset-0">
                  <DiagnosticsPage onBack={() => handleNavigate('about:blank')} />
                </div>
              )}

              {/* Webviews — mounted unless the tab is asleep; visibility toggled */}
              {tabs
                .filter((t) => t.url && t.url !== 'about:blank' && !t.url.startsWith('zyphora://'))
                .map((t) => (
                  <div key={t.id} className="absolute inset-0 w-full h-full"
                    style={{ display: !settingsOpen && t.id === activeTabId ? 'flex' : 'none' }}>
                    {asleepTabs.has(t.id) ? (
                      <SleepPlaceholder
                        title={t.title || t.url}
                        onWake={() => { wakeTab(t.id); activateTab(t.id); }}
                      />
                    ) : (
                      <WebView tab={t} />
                    )}
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
              onOpenDownloads={() => createTabWithUrl('zyphora://downloads')}
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
          {panel === 'closed' && (
            <div className="w-72 shrink-0 flex flex-col border-l border-[var(--border)] overflow-hidden">
              <RecentlyClosedPanel
                onRestore={(index) => restoreClosedTab(index)}
                onClose={() => setPanel(null)}
              />
            </div>
          )}
        </div>
      </div>

      {/* Download-start notifications */}
      <DownloadToast onOpenDownloads={() => createTabWithUrl('zyphora://downloads')} />

      {/* Command palette (Ctrl+K) */}
      {paletteOpen && (
        <CommandPalette
          onClose={() => setPaletteOpen(false)}
          onNavigate={handleNavigate}
          onCreateTab={(privateMode) => createTab(privateMode)}
          onOpenUrl={(url) => createTabWithUrl(url)}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenFind={() => setFindOpen(true)}
          onClearData={() => setClearDialogOpen(true)}
        />
      )}

      {/* Keyboard shortcut cheat sheet (Ctrl+/) */}
      {cheatsheetOpen && <ShortcutCheatsheet onClose={() => setCheatsheetOpen(false)} />}

      {/* Clear browsing data (also available from History) */}
      {clearDialogOpen && (
        <ClearBrowsingDataDialog
          onClose={() => setClearDialogOpen(false)}
          onDone={() => setClearDialogOpen(false)}
        />
      )}

    </div>
  );
};
