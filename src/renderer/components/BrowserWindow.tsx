import React, { useState, useCallback } from 'react';
import { SidebarTabs } from './SidebarTabs';
import { TitleBar } from './TitleBar';
import { NavBar } from './NavBar';
import { WebView } from './WebView';
import { useTabSleep } from '../hooks/useTabSleep';
import { PermissionPrompt } from './PermissionPrompt';
import { NewTabPage } from './NewTabPage';
import { SettingsPage } from './SettingsPage';
import { AuthPortal, type AuthPortalMode } from './AuthPortal';
import { DownloadsPage } from './DownloadsPage';
import { DownloadToast } from './DownloadToast';
import { HistoryPanel } from './HistoryPanel';
import { BookmarksPanel } from './BookmarksPanel';
import { FindBar } from './FindBar';
import { RecentlyClosedPanel } from './RecentlyClosedPanel';
import { SavePasswordPrompt } from './SavePasswordPrompt';
import { PasswordsPanel } from './PasswordsPanel';
import { useSettingsStore } from '../stores/settingsStore';
import { useBrowserStore } from '../stores/tabStore';
import { useBrowser } from '../hooks/useBrowser';
import { useBookmarks } from '../hooks/useBookmarks';
import { normalizeNavigationUrl } from '../../shared/navigation';
import { stripTrackingParams } from '../../shared/trackingParams';

function looksLikeUrl(input: string): boolean {
  const trimmed = input.trim();
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('file://') ||
    trimmed.startsWith('about:') ||
    trimmed.startsWith('zyphora://') ||
    trimmed.startsWith('localhost')
  )
    return true;
  return trimmed.includes('.') && !trimmed.includes(' ');
}

type Panel = 'history' | 'bookmarks' | 'closed' | 'passwords' | null;

interface PendingCredential {
  origin: string;
  username: string;
  password: string;
  title: string;
  favicon?: string;
}

export const BrowserWindow: React.FC = () => {
  const tabs = useBrowserStore((s) => s.tabs);
  const activeTabId = useBrowserStore((s) => s.activeTabId);
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const buildSearchUrl = useSettingsStore((s) => s.buildSearchUrl);
  const blockTrackers = useSettingsStore((s) => s.security.blockTrackers);
  const adblockAllowlist = useSettingsStore((s) => s.adblockAllowlist);
  const forceHttps = useSettingsStore((s) => s.security.forceHttps);
  const doNotTrack = useSettingsStore((s) => s.security.doNotTrack);
  const privateByDefault = useSettingsStore((s) => s.security.privateByDefault);
  const savedProxy = useSettingsStore((s) => s.proxy);
  const savedDownloadPath = useSettingsStore((s) => s.downloadPath);
  const proxyEnabled = useSettingsStore((s) => s.proxyEnabled);
  const setProxy = useSettingsStore((s) => s.setProxy);
  const setProxyEnabled = useSettingsStore((s) => s.setProxyEnabled);
  const passwordManagerEnabled = useSettingsStore((s) => s.passwordManagerEnabled);
  const restoreSession = useSettingsStore((s) => s.restoreSession);
  const stripTracking = useSettingsStore((s) => s.stripTrackingParams);
  const historyRetentionDays = useSettingsStore((s) => s.historyRetentionDays);
  const sleepTabs = useSettingsStore((state) => state.sleepTabs);
  const sleepTabsAfterMinutes = useSettingsStore((state) => state.sleepTabsAfterMinutes);

  // ── UI state ──
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthPortalMode | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const togglePanel = (p: Panel) => setPanel((cur) => (cur === p ? null : p));
  const [pendingCredential, setPendingCredential] = useState<PendingCredential | null>(null);
  const [savingCredential, setSavingCredential] = useState(false);

  const { toggle: toggleBookmark, isBookmarked } = useBookmarks();

  const {
    navigate,
    createTab,
    createTabWithUrl,
    closeTab,
    activateTab,
    toggleTabMuted,
    goBack,
    goForward,
    reload,
    stop,
    restoreClosedTab,
    zoom,
    resetZoom,
    printPage,
  } = useBrowser();
  const createNewBrowserTab = useCallback(
    () => createTab(privateByDefault),
    [createTab, privateByDefault]
  );
  const reorderTabs = useBrowserStore((s) => s.reorderTabs);

  // ── Navigation ── (defined before any callback that calls it)
  const handleNavigate = useCallback(
    (input: string) => {
      const trimmed = input.trim();
      if (!trimmed) return;
      if (trimmed === 'about:blank') {
        navigate('about:blank');
        return;
      }
      const url = looksLikeUrl(trimmed) ? normalizeNavigationUrl(trimmed) : null;
      const destination = url ?? buildSearchUrl(trimmed);
      const secureDestination =
        forceHttps && destination.startsWith('http://')
          ? `https://${destination.slice('http://'.length)}`
          : destination;
      // Drop campaign/click-ID parameters before the URL reaches a webview, so
      // they never land in history or in a copied address either.
      const cleaned = stripTracking ? stripTrackingParams(secureDestination) : secureDestination;
      navigate(cleaned);
    },
    [navigate, buildSearchUrl, forceHttps, stripTracking]
  );

  const handleBookmarkToggle = useCallback(() => {
    if (!activeTab?.url || activeTab.url.startsWith('about:')) return;
    void toggleBookmark(activeTab.url, activeTab.title, activeTab.favicon).catch(
      (error: unknown) => {
        console.error('[bookmarks] failed to toggle bookmark:', error);
      }
    );
  }, [activeTab, toggleBookmark]);

  // ── Password manager ──
  // Listen for capture events from the main process. The prompt is only ever
  // shown when the feature is on; credentials are dropped otherwise.
  React.useEffect(() => {
    if (!window.browserAPI?.passwords?.onSavePrompt) return;
    return window.browserAPI.passwords.onSavePrompt((data) => {
      if (!useSettingsStore.getState().passwordManagerEnabled) return;
      setPendingCredential(data);
    });
  }, []);

  // Drop any queued prompt the moment the user turns the feature off.
  React.useEffect(() => {
    if (!passwordManagerEnabled) setPendingCredential(null);
  }, [passwordManagerEnabled]);

  const handleSaveCredential = useCallback(async () => {
    if (!pendingCredential || savingCredential) return;
    setSavingCredential(true);
    try {
      await window.browserAPI.passwords.save(
        pendingCredential.origin,
        pendingCredential.username,
        pendingCredential.password,
        pendingCredential.title,
        pendingCredential.favicon
      );
      setPendingCredential(null);
    } catch (error) {
      console.error('[passwords] failed to save credential:', error);
    } finally {
      setSavingCredential(false);
    }
  }, [pendingCredential, savingCredential]);

  const handleAutofill = useCallback(
    async (username: string, password: string) => {
      if (!activeTabId) return;
      try {
        await window.browserAPI.passwords.autofill(activeTabId, username, password);
      } catch (error) {
        console.error('[passwords] autofill failed:', error);
      }
    },
    [activeTabId]
  );

  // Idle background tabs are unmounted entirely; hiding a <webview> does not
  // release its renderer process.
  const { sleeping, wake } = useTabSleep({
    tabs,
    activeTabId,
    enabled: sleepTabs,
    idleMinutes: sleepTabsAfterMinutes,
  });

  // Wake before activating so the webview mounts in the same commit as the
  // switch, rather than a frame later once the active-tab effect runs.
  const handleTabClick = React.useCallback(
    (tabId: string) => {
      wake(tabId);
      activateTab(tabId);
    },
    [wake, activateTab]
  );

  React.useEffect(() => window.browserAPI.onOpenFind(() => setFindOpen(true)), []);

  // ── Keyboard shortcuts ──
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 't') {
        e.preventDefault();
        createNewBrowserTab();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
        e.preventDefault();
        if (activeTabId) closeTab(activeTabId);
      } else if (((e.ctrlKey || e.metaKey) && e.key === 'r') || e.key === 'F5') {
        e.preventDefault();
        reload();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '=')) {
        e.preventDefault();
        zoom(0.1);
      } else if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault();
        zoom(-0.1);
      } else if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault();
        resetZoom();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'm') {
        // Mute/unmute the current tab, as in Firefox.
        e.preventDefault();
        if (activeTabId) toggleTabMuted(activeTabId);
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        printPage();
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'T') {
        e.preventDefault();
        restoreClosedTab();
      } else if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        goBack();
      } else if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        goForward();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        handleBookmarkToggle();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setFindOpen(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        setSettingsOpen(true);
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'P' || e.key === 'p')) {
        if (!passwordManagerEnabled) return;
        e.preventDefault();
        togglePanel('passwords');
      } else if (e.key === 'Escape') {
        if (pendingCredential) {
          setPendingCredential(null);
          return;
        }
        if (findOpen) {
          setFindOpen(false);
          return;
        }
        if (settingsOpen) {
          setSettingsOpen(false);
          return;
        }
        if (panel) {
          setPanel(null);
          return;
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    activeTabId,
    findOpen,
    panel,
    settingsOpen,
    pendingCredential,
    passwordManagerEnabled,
    createNewBrowserTab,
    createTabWithUrl,
    closeTab,
    toggleTabMuted,
    reload,
    restoreClosedTab,
    zoom,
    resetZoom,
    printPage,
    goBack,
    goForward,
    handleBookmarkToggle,
  ]);

  const isNewTab = !activeTab?.url || activeTab.url === 'about:blank';
  const isDownloads = activeTab?.url === 'zyphora://downloads';

  // Keep internal pages showing a friendly tab title (the webview never loads
  // them, so main never receives a real title for zyphora:// URLs).
  React.useEffect(() => {
    if (activeTab && isDownloads && activeTab.title !== 'Downloads') {
      window.browserAPI.sendMessage({
        type: 'webview-title-updated',
        tabId: activeTab.id,
        title: 'Downloads',
      });
    }
  }, [activeTab?.id, activeTab?.url, activeTab?.title, isDownloads]);

  // Keep network security settings in sync with the main process before a
  // renderer-initiated navigation can happen.
  React.useEffect(() => {
    window.browserAPI.security.set({ forceHttps, doNotTrack }).catch(() => {});
  }, [forceHttps, doNotTrack]);

  // Main starts with session capture off and only learns the user's choice
  // once persisted settings have hydrated here.
  React.useEffect(() => {
    window.browserAPI.session.setRestoreEnabled(restoreSession).catch(() => {});
  }, [restoreSession]);

  // Applying retention also prunes immediately, so this both configures the
  // main process and performs the startup cleanup.
  React.useEffect(() => {
    window.browserAPI.history.setRetention(historyRetentionDays).catch(() => {});
  }, [historyRetentionDays]);

  // The initial tab is created by the main process before the renderer can read
  // persisted settings. Mark it private while it is still a blank page so the
  // setting applies to the first tab as well.
  React.useEffect(() => {
    if (privateByDefault && activeTab?.url === 'about:blank' && !activeTab.privateMode) {
      window.browserAPI
        .sendMessage({
          type: 'set-tab-private',
          tabId: activeTab.id,
          privateMode: true,
        })
        .catch(() => {});
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
    <div className="relative flex h-screen w-screen overflow-hidden bg-[var(--bg)]">
      {/* Left sidebar */}
      <SidebarTabs
        tabs={tabs}
        activeTabId={activeTabId}
        onTabClick={handleTabClick}
        onTabClose={closeTab}
        onTabToggleMuted={toggleTabMuted}
        sleepingTabIds={sleeping}
        onTabReorder={reorderTabs}
        onNewTab={createNewBrowserTab}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenHistory={() => togglePanel('history')}
        onOpenBookmarks={() => togglePanel('bookmarks')}
        onOpenRecentlyClosed={() => togglePanel('closed')}
        onOpenPasswords={passwordManagerEnabled ? () => togglePanel('passwords') : undefined}
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
              {authMode && (
                <div className="absolute inset-0 z-40 bg-[var(--bg)]">
                  <AuthPortal mode={authMode} onClose={() => setAuthMode(null)} />
                </div>
              )}

              {settingsOpen && !authMode && (
                <div className="absolute inset-0 z-20 flex overflow-hidden bg-[var(--bg)]">
                  <SettingsPage
                    onBack={() => setSettingsOpen(false)}
                    onOpenAuth={(mode) => setAuthMode(mode)}
                  />
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

              {/* Webviews — mounted unless asleep, visibility toggled */}
              {tabs
                .filter(
                  (t) =>
                    t.url &&
                    t.url !== 'about:blank' &&
                    !t.url.startsWith('zyphora://') &&
                    !sleeping.has(t.id)
                )
                .map((t) => (
                  <div
                    key={t.id}
                    className="absolute inset-0 w-full h-full"
                    style={{ display: !settingsOpen && t.id === activeTabId ? 'flex' : 'none' }}
                  >
                    <WebView tab={t} />
                  </div>
                ))}

              {/* Custom permission prompts (camera, mic, location, …) */}
              <PermissionPrompt />
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
                onNavigate={(url) => {
                  handleNavigate(url);
                  setPanel(null);
                }}
                onClose={() => setPanel(null)}
              />
            </div>
          )}
          {panel === 'bookmarks' && (
            <div className="w-72 shrink-0 flex flex-col border-l border-[var(--border)] overflow-hidden">
              <BookmarksPanel
                onNavigate={(url) => {
                  handleNavigate(url);
                  setPanel(null);
                }}
                onClose={() => setPanel(null)}
              />
            </div>
          )}
          {panel === 'passwords' && passwordManagerEnabled && (
            <div className="w-72 shrink-0 flex flex-col border-l border-[var(--border)] overflow-hidden">
              <PasswordsPanel onClose={() => setPanel(null)} onAutofill={handleAutofill} />
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

      {/* Save-password prompt */}
      {pendingCredential && passwordManagerEnabled && (
        <div className="absolute bottom-4 right-4 z-50">
          <SavePasswordPrompt
            origin={pendingCredential.origin}
            username={pendingCredential.username}
            password={pendingCredential.password}
            title={pendingCredential.title}
            favicon={pendingCredential.favicon}
            onSave={() => {
              void handleSaveCredential();
            }}
            onDismiss={() => setPendingCredential(null)}
          />
        </div>
      )}

      {/* Download-start notifications */}
      <DownloadToast onOpenDownloads={() => createTabWithUrl('zyphora://downloads')} />
    </div>
  );
};
