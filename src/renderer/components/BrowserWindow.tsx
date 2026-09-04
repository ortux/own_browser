import React, { useState, useCallback } from 'react';
import { SidebarTabs } from './SidebarTabs';
import { TitleBar } from './TitleBar';
import { NavBar } from './NavBar';
import { WebView } from './WebView';
import { useTabSleep } from '../hooks/useTabSleep';
import { PermissionPrompt } from './PermissionPrompt';
import { NewTabPage } from './NewTabPage';
import { AgentSidebar } from './AgentSidebar';
import { AgentQuickControls } from './agent/AgentQuickControls';
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
import { CommandPalette } from './CommandPalette';
import { SiteSettingsPopover } from './SiteSettingsPopover';
import { useSettingsStore } from '../stores/settingsStore';
import { useApplyGeneralSettings } from './settings/useGeneralSettings';
import { useBrowserStore } from '../stores/tabStore';
import { useBrowser } from '../hooks/useBrowser';
import { useBookmarks } from '../hooks/useBookmarks';
import { normalizeNavigationUrl, INTERNAL_PAGES } from '../../shared/navigation';
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

const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || '');

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
  const general = useSettingsStore((s) => s.general);
  const sleepTabs = useSettingsStore((state) => state.sleepTabs);
  const sleepTabsAfterMinutes = useSettingsStore((state) => state.sleepTabsAfterMinutes);

  // Pushes the Chromium/OS-owned General settings to the main process and the
  // accessibility flags to the shell document. Mounted once, here.
  useApplyGeneralSettings();

  // ── UI state ──
  const [authMode, setAuthMode] = useState<AuthPortalMode | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [siteSettingsOpen, setSiteSettingsOpen] = useState(false);
  const [readerActive, setReaderActive] = useState(false);
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
    toggleTabPinned,
    reorderTabs,
    goBack,
    goForward,
    reload,
    hardReload,
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

  // ── Navigation ── (defined before any callback that calls it)
  /**
   * Focus the existing Settings tab if there is one, otherwise open it.
   * Matches how Chrome and Firefox treat their settings pages — asking for
   * settings twice should not leave you with two of them.
   */
  const openSettings = useCallback(() => {
    const existing = tabs.find((t) => t.url === INTERNAL_PAGES.settings);
    if (existing) activateTab(existing.id);
    else createTabWithUrl(INTERNAL_PAGES.settings);
  }, [tabs, activateTab, createTabWithUrl]);

  const openAuth = useCallback(() => {
    setAuthMode('signin');
  }, []);

  // The agent is a full-mode feature: in minimal mode it is never rendered and
  // its shortcut does nothing.
  const browserMode = useSettingsStore((s) => s.browserMode);
  const agentAvailable = browserMode === 'full';
  const [agentOpen, setAgentOpen] = React.useState(false);

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
      // The main process enforces force-HTTPS on every guest navigation
      // (including redirects and in-page links), and it exempts localhost and
      // LAN hosts. Doing a second, cruder string-slice upgrade here only
      // duplicated that logic with different behaviour, so leave it to main.
      const secureDestination = destination;
      // Drop campaign/click-ID parameters before the URL reaches a webview, so
      // they never land in history or in a copied address either.
      const cleaned = stripTracking ? stripTrackingParams(secureDestination) : secureDestination;
      navigate(cleaned);
    },
    [navigate, buildSearchUrl, stripTracking]
  );

  const handleBookmarkToggle = useCallback(() => {
    if (!activeTab?.url || activeTab.url.startsWith('about:')) return;
    void toggleBookmark(activeTab.url, activeTab.title, activeTab.favicon).catch(
      (error: unknown) => {
        console.error('[bookmarks] failed to toggle bookmark:', error);
      }
    );
  }, [activeTab, toggleBookmark]);

  // ── Reading mode ──
  const handleReaderToggle = useCallback(async () => {
    if (!activeTabId || !activeTab?.url || !/^https?:\/\//.test(activeTab.url)) return;
    try {
      const result = await window.browserAPI?.reader.toggle(activeTabId);
      if (result?.ok) setReaderActive(Boolean(result.activated));
    } catch (error) {
      console.error('[reader] toggle failed:', error);
    }
  }, [activeTabId, activeTab?.url]);

  // Reader mode is page-scoped, so a URL change clears it. The injected flag
  // lives in the page, though, and an in-page (SPA) navigation does not reset
  // it — so re-read the real state from the guest instead of assuming, or the
  // toolbar button toggles the wrong direction.
  React.useEffect(() => {
    let cancelled = false;
    setReaderActive(false);
    if (!activeTabId) return;

    void window.browserAPI?.reader
      ?.isActive?.(activeTabId)
      .then((active) => {
        if (!cancelled) setReaderActive(Boolean(active));
      })
      .catch(() => {
        /* guest may be gone; the false default is correct */
      });

    return () => {
      cancelled = true;
    };
  }, [activeTabId, activeTab?.url]);

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
        // A pinned tab ignores Ctrl+W; that is most of the point of pinning.
        // Closing it requires unpinning first, or the explicit close button.
        const current = tabs.find((t) => t.id === activeTabId);
        if (activeTabId && !current?.pinned) closeTab(activeTabId);
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
      } else if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'p' || e.key === 'P')) {
        // Alt+P, not Ctrl+Shift+P: the latter already opens the passwords
        // panel, and Ctrl+P is print.
        e.preventDefault();
        if (activeTabId) toggleTabPinned(activeTabId);
      } else if (
        e.key === 'm' &&
        // Mute/unmute the current tab, as in Firefox. On macOS Cmd+M is the
        // system minimize shortcut, so only Ctrl+M toggles mute there.
        (isMac ? e.ctrlKey && !e.metaKey : e.ctrlKey || e.metaKey)
      ) {
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
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        openSettings();
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'P' || e.key === 'p')) {
        if (!passwordManagerEnabled) return;
        e.preventDefault();
        togglePanel('passwords');
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
        // Ctrl+Shift+A toggles the agent sidebar. No-op in minimal mode.
        e.preventDefault();
        if (agentAvailable) setAgentOpen((v) => !v);
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'R' || e.key === 'r')) {
        // Ctrl+Shift+R is hard-reload everywhere else; reading mode moved to
        // Alt+R so the muscle memory keeps working.
        e.preventDefault();
        hardReload();
      } else if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        void handleReaderToggle();
      } else if (e.key === 'Escape') {
        if (paletteOpen) {
          setPaletteOpen(false);
          return;
        }
        if (pendingCredential) {
          setPendingCredential(null);
          return;
        }
        if (findOpen) {
          setFindOpen(false);
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
    pendingCredential,
    paletteOpen,
    passwordManagerEnabled,
    agentAvailable,
    openSettings,
    createNewBrowserTab,
    createTabWithUrl,
    closeTab,
    tabs,
    toggleTabMuted,
    toggleTabPinned,
    reload,
    hardReload,
    restoreClosedTab,
    zoom,
    resetZoom,
    printPage,
    goBack,
    goForward,
    handleBookmarkToggle,
    handleReaderToggle,
  ]);

  const isNewTab = !activeTab?.url || activeTab.url === 'about:blank';
  const isDownloads = activeTab?.url === INTERNAL_PAGES.downloads;
  // Settings is a real page at zyphora://settings, so it lives in a tab like
  // any other: it can be bookmarked in history, reopened with Ctrl+Shift+T,
  // and you can keep it open while browsing in another tab.
  const isSettings = activeTab?.url === INTERNAL_PAGES.settings;

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
    window.browserAPI.security.set({ forceHttps, doNotTrack, stripTracking }).catch(() => {});
  }, [forceHttps, doNotTrack, stripTracking]);

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

  // Tell main about "open new tabs in private mode" so tabs it creates on its
  // own — popups, restored sessions, the launch tab — honour it too. Main
  // starts with the setting off and only learns it once settings hydrate here.
  React.useEffect(() => {
    window.browserAPI
      .sendMessage({ type: 'private-by-default', enabled: privateByDefault })
      .catch(() => {});
  }, [privateByDefault]);

  // The launch tab is created before the renderer can read persisted settings,
  // so retro-mark it while it is still blank.
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

  /**
   * "Open specific pages" on startup.
   *
   * Main creates the launch tab before the renderer has hydrated its persisted
   * settings, so the pages are opened here, once, and only while that launch
   * tab is still blank — otherwise a restored session would be buried under
   * them.
   */
  const startupPagesOpened = React.useRef(false);
  React.useEffect(() => {
    if (startupPagesOpened.current) return;
    if (general.startupMode !== 'specific-pages' || general.startupPages.length === 0) return;
    if (tabs.length !== 1 || tabs[0].url !== 'about:blank') return;
    startupPagesOpened.current = true;
    for (const url of general.startupPages) createTabWithUrl(url);
  }, [general.startupMode, general.startupPages, tabs, createTabWithUrl]);

  // ── Optionally open the Downloads page when a new download begins ──
  const openDownloadsOnStart = useSettingsStore((s) => s.openDownloadsOnStart);
  React.useEffect(() => {
    if (!window.browserAPI?.downloads?.onStarted) return;
    const unsub = window.browserAPI.downloads.onStarted(() => {
      if (openDownloadsOnStart) createTabWithUrl(INTERNAL_PAGES.downloads);
    });
    return unsub;
  }, [openDownloadsOnStart, createTabWithUrl]);

  return (
    <div className="relative flex h-screen w-screen overflow-hidden bg-[var(--bg)]">
      {/* Left sidebar — hidden when "Show sidebar" is off in General settings. */}
      {general.showSidebar && (
        <SidebarTabs
          tabs={tabs}
          activeTabId={activeTabId}
          onTabClick={handleTabClick}
          onTabClose={closeTab}
          onTabToggleMuted={toggleTabMuted}
          sleepingTabIds={sleeping}
          onTabTogglePinned={toggleTabPinned}
          onTabReorder={reorderTabs}
          onNewTab={createNewBrowserTab}
          onOpenSettings={openSettings}
          onOpenHistory={() => togglePanel('history')}
          onOpenBookmarks={() => togglePanel('bookmarks')}
          onOpenRecentlyClosed={() => togglePanel('closed')}
          onOpenPasswords={passwordManagerEnabled ? () => togglePanel('passwords') : undefined}
          onToggleAgent={agentAvailable ? () => setAgentOpen((v) => !v) : undefined}
          agentOpen={agentOpen}
          onOpenAuth={openAuth}
        />
      )}

      {/* Main column */}
      <div className="flex flex-col flex-1 min-w-0">
        <TitleBar />

        {/* Content row */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Browser + navbar */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <div className="flex-1 overflow-hidden relative bg-[var(--bg)]">
              {findOpen && !isSettings && (
                <FindBar tabId={activeTabId || undefined} onClose={() => setFindOpen(false)} />
              )}

              {/* Sign-in still overlays everything, since it is modal. */}
              {authMode && (
                <div className="absolute inset-0 z-40 bg-[var(--bg)]">
                  <AuthPortal mode={authMode} onClose={() => setAuthMode(null)} />
                </div>
              )}

              {/* Settings page (zyphora://settings) */}
              {isSettings && !authMode && (
                <div className="absolute inset-0 flex overflow-hidden bg-[var(--bg)]">
                  <SettingsPage onOpenAuth={(mode) => setAuthMode(mode)} />
                </div>
              )}

              {/* New tab page */}
              {isNewTab && (
                <div className="absolute inset-0">
                  <NewTabPage onSearch={handleNavigate} />
                </div>
              )}

              {/* Downloads page (zyphora://downloads) */}
              {isDownloads && (
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
                    style={{ display: t.id === activeTabId ? 'flex' : 'none' }}
                  >
                    <WebView tab={t} />
                  </div>
                ))}

              {/* Custom permission prompts (camera, mic, location, …) */}
              <PermissionPrompt />

              {/* Agent status and permission requests, over the page area so
                  the user never has to open Settings to regain control. */}
              {agentAvailable && (
                <AgentQuickControls
                  currentUrl={activeTab?.url ?? ''}
                  onOpenSettings={openSettings}
                />
              )}
            </div>

            <NavBar
              activeTab={activeTab}
              onBack={goBack}
              onForward={goForward}
              onReload={reload}
              onStop={stop}
              onNavigate={handleNavigate}
              onOpenSettings={openSettings}
              showHomeButton={general.showHomeButton}
              onHome={() =>
                handleNavigate(
                  general.homepageMode === 'custom' && general.homepageUrl
                    ? general.homepageUrl
                    : 'about:blank'
                )
              }
              onBookmark={handleBookmarkToggle}
              isBookmarked={activeTab?.url ? isBookmarked(activeTab.url) : false}
              onOpenDownloads={() => createTabWithUrl(INTERNAL_PAGES.downloads)}
              onToggleReader={handleReaderToggle}
              readerActive={readerActive}
              onOpenSiteSettings={() => setSiteSettingsOpen((v) => !v)}
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

          {agentAvailable && (
            <AgentSidebar
              open={agentOpen}
              onClose={() => setAgentOpen(false)}
              onOpenSettings={() => {
                setAgentOpen(false);
                openSettings();
              }}
            />
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
      <DownloadToast onOpenDownloads={() => createTabWithUrl(INTERNAL_PAGES.downloads)} />

      {/* Command palette — global ⌘K overlay. */}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onNavigate={handleNavigate}
        onNewTab={createNewBrowserTab}
        onActivateTab={activateTab}
        onCloseTab={closeTab}
        onToggleMute={toggleTabMuted}
        onTogglePin={toggleTabPinned}
        onOpenSettings={openSettings}
        onOpenDownloads={() => createTabWithUrl(INTERNAL_PAGES.downloads)}
        onPrint={printPage}
        onFind={() => setFindOpen(true)}
        onReload={reload}
        onGoBack={goBack}
        onGoForward={goForward}
        onReaderToggle={handleReaderToggle}
      />

      {/* Site settings popover (anchored to the navbar gear button) */}
      {siteSettingsOpen &&
        activeTab?.url &&
        (() => {
          let host = '';
          try {
            host = new URL(activeTab.url).hostname.toLowerCase();
          } catch {
            host = '';
          }
          if (!host) return null;
          return (
            <div className="absolute bottom-12 right-[180px] z-50">
              <SiteSettingsPopover host={host} onClose={() => setSiteSettingsOpen(false)} />
            </div>
          );
        })()}
    </div>
  );
};
