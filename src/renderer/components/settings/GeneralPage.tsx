/**
 * GeneralPage.tsx — the browser's General settings.
 *
 * Every control here is bound to the single persisted settings store. Where a
 * preference already existed (theme, search engine, session restore, tab
 * sleeping, download folder) this page binds to that existing state rather
 * than keeping a second copy of it.
 *
 * The layout follows the convention used across Zyphora's settings: a titled
 * Section, a Panel, and Rows separated by hairlines — no nested cards.
 */

import React from 'react';
import { Check, FolderOpen, Globe, Monitor, Moon, Sun, Trash2, TriangleAlert } from 'lucide-react';
import {
  Button,
  ConfirmDialog,
  Panel,
  RadioGroup,
  Row,
  Section,
  Segmented,
  Select,
  Slider,
  Switch,
  TagList,
  TextInput,
  UrlListEditor,
} from './SettingsUi';
import { SEARCH_ENGINES, useSettingsStore } from '../../stores/settingsStore';
import {
  BROWSER_LANGUAGES,
  FONT_SIZE_RANGE,
  MIN_FONT_SIZE_RANGE,
  REGIONS,
  ZOOM_LEVELS,
  normalizeSettingsUrl,
  resolveLocale,
  type GeneralSettings,
} from '../../../shared/generalSettings';
import { useDefaultBrowser } from './useGeneralSettings';

interface GeneralPageProps {
  /** Anchor to scroll to and highlight, set by sidebar or search navigation. */
  focusAnchor?: string | null;
  /** Called once the anchor has been handled, so it is not re-applied. */
  onAnchorHandled?: () => void;
  /** Opens the Clear Browsing Data section of Settings. */
  onOpenClearData: () => void;
  /** Opens the Search section, where engines are managed. */
  onOpenSearchEngines: () => void;
}

const THEME_OPTIONS = [
  { id: 'light' as const, label: 'Light', icon: Sun },
  { id: 'dark' as const, label: 'Dark', icon: Moon },
  { id: 'system' as const, label: 'System', icon: Monitor },
];

const DATE_FORMATS = [
  { id: 'system', label: 'System default' },
  { id: 'dmy', label: 'DD/MM/YYYY' },
  { id: 'mdy', label: 'MM/DD/YYYY' },
  { id: 'ymd', label: 'YYYY-MM-DD' },
];

const NUMBER_FORMATS = [
  { id: 'system', label: 'System default' },
  { id: 'comma-dot', label: '1,234,567.89' },
  { id: 'dot-comma', label: '1.234.567,89' },
  { id: 'space-comma', label: '1 234 567,89' },
  { id: 'indian', label: '12,34,567.89' },
];

const DISCARD_PERIODS = [15, 30, 60, 120, 240];

/**
 * A section wrapper that can be highlighted when navigated to from search.
 * The highlight fades on its own; it exists to answer "which one did I click".
 */
const Anchored: React.FC<{
  id: string;
  highlighted: boolean;
  children: React.ReactNode;
}> = ({ id, highlighted, children }) => (
  <div
    id={`setting-${id}`}
    className={`scroll-mt-6 rounded-lg transition-colors duration-700 ${
      highlighted ? 'bg-[var(--accent-soft)] ring-1 ring-[var(--border-strong)]' : ''
    }`}
  >
    {children}
  </div>
);

export const GeneralPage: React.FC<GeneralPageProps> = ({
  focusAnchor,
  onAnchorHandled,
  onOpenClearData,
  onOpenSearchEngines,
}) => {
  const general = useSettingsStore((s) => s.general);
  const setGeneral = useSettingsStore((s) => s.setGeneral);
  const addStartupPage = useSettingsStore((s) => s.addStartupPage);
  const updateStartupPage = useSettingsStore((s) => s.updateStartupPage);
  const removeStartupPage = useSettingsStore((s) => s.removeStartupPage);
  const addNeverTranslateLanguage = useSettingsStore((s) => s.addNeverTranslateLanguage);
  const removeNeverTranslateLanguage = useSettingsStore((s) => s.removeNeverTranslateLanguage);
  const resetBrowserSettings = useSettingsStore((s) => s.resetBrowserSettings);

  // Pre-existing settings this page surfaces rather than duplicates.
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const searchEngineId = useSettingsStore((s) => s.searchEngineId);
  const setSearchEngine = useSettingsStore((s) => s.setSearchEngine);
  const customSearchEngines = useSettingsStore((s) => s.customSearchEngines);
  const restoreSession = useSettingsStore((s) => s.restoreSession);
  const setRestoreSession = useSettingsStore((s) => s.setRestoreSession);
  const sleepTabs = useSettingsStore((s) => s.sleepTabs);
  const setSleepTabs = useSettingsStore((s) => s.setSleepTabs);
  const sleepTabsAfterMinutes = useSettingsStore((s) => s.sleepTabsAfterMinutes);
  const setSleepTabsAfterMinutes = useSettingsStore((s) => s.setSleepTabsAfterMinutes);
  const downloadPath = useSettingsStore((s) => s.downloadPath);
  const setDownloadPath = useSettingsStore((s) => s.setDownloadPath);

  const [highlight, setHighlight] = React.useState<string | null>(null);
  const [resetOpen, setResetOpen] = React.useState(false);
  const [homepageDraft, setHomepageDraft] = React.useState(general.homepageUrl);
  const [homepageError, setHomepageError] = React.useState('');
  const { isDefault, checking, makeDefault, statusMessage } = useDefaultBrowser();

  // Keep the homepage field in step when the value changes elsewhere (reset).
  React.useEffect(() => {
    setHomepageDraft(general.homepageUrl);
  }, [general.homepageUrl]);

  // Scroll to the requested setting and flash it.
  React.useEffect(() => {
    if (!focusAnchor) return;
    const element = document.getElementById(`setting-${focusAnchor}`);
    element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setHighlight(focusAnchor);
    onAnchorHandled?.();
    const timer = setTimeout(() => setHighlight(null), 2200);
    return () => clearTimeout(timer);
  }, [focusAnchor, onAnchorHandled]);

  // Launch-at-login is real OS state; read it back so the toggle cannot lie.
  React.useEffect(() => {
    void window.browserAPI?.general
      ?.getLaunchAtLogin()
      .then((enabled) => {
        if (enabled !== general.launchAtLogin) setGeneral('launchAtLogin', enabled);
      })
      .catch(() => {});
    // Deliberately mount-only: afterwards the toggle keeps the two in sync,
    // and re-running on every store change would fight the user's click.
  }, []); // eslint-disable-line

  const set =
    <K extends keyof GeneralSettings>(key: K) =>
    (value: GeneralSettings[K]) =>
      setGeneral(key, value);

  const engines = [...SEARCH_ENGINES, ...customSearchEngines].map((engine) => ({
    id: engine.id,
    label: engine.name,
  }));

  const locale = resolveLocale(general);
  const sampleDate = React.useMemo(() => new Date(2026, 8, 3, 15, 4), []);
  const formattedDate = (() => {
    try {
      if (general.dateFormat === 'ymd') return '2026-09-03';
      if (general.dateFormat === 'dmy') return '03/09/2026';
      if (general.dateFormat === 'mdy') return '09/03/2026';
      return sampleDate.toLocaleDateString(locale);
    } catch {
      return sampleDate.toLocaleDateString();
    }
  })();
  const formattedTime = sampleDate.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: general.timeFormat === '12h',
  });

  const handleHomepageCommit = () => {
    if (!homepageDraft.trim()) {
      setGeneral('homepageUrl', '');
      setHomepageError('');
      return;
    }
    const normalized = normalizeSettingsUrl(homepageDraft);
    if (!normalized) {
      setHomepageError('Enter a valid web address, for example example.com');
      return;
    }
    setGeneral('homepageUrl', normalized);
    setHomepageDraft(normalized);
    setHomepageError('');
  };

  return (
    <div className="max-w-3xl pb-20">
      {/* ── 1. Startup ─────────────────────────────────────────────────── */}
      <Anchored id="startup" highlighted={highlight === 'startup'}>
        <Section title="Startup" description="Choose what happens when the browser starts.">
          <Panel>
            <RadioGroup
              name="startup-mode"
              label="On startup"
              value={general.startupMode}
              onChange={(mode) => {
                setGeneral('startupMode', mode);
                // "Continue where you left off" IS session restore, so keep
                // the existing restoreSession flag — which the main process
                // already reads — in step instead of adding a second one.
                if (mode === 'continue') setRestoreSession(true);
                else if (general.startupMode === 'continue') setRestoreSession(false);
              }}
              options={[
                { id: 'new-tab', label: 'Open the New Tab page' },
                {
                  id: 'continue',
                  label: 'Continue where you left off',
                  description: 'Reopen the tabs you had open when you last closed Zyphora.',
                },
                { id: 'specific-pages', label: 'Open specific pages' },
              ]}
            />

            {general.startupMode === 'specific-pages' && (
              <div className="border-t border-[var(--border)] bg-[var(--surface-2)]/40 pt-2">
                <UrlListEditor
                  urls={general.startupPages}
                  onAdd={addStartupPage}
                  onUpdate={updateStartupPage}
                  onRemove={removeStartupPage}
                  emptyLabel="No startup pages yet. Zyphora opens the New Tab page until you add one."
                />
              </div>
            )}

            <div className="border-t border-[var(--border)]">
              <Row
                label="Launch browser at system startup"
                description="Open Zyphora automatically when you sign in to this computer."
              >
                <Switch
                  label="Launch browser at system startup"
                  checked={general.launchAtLogin}
                  onChange={(next) => {
                    setGeneral('launchAtLogin', next);
                    void window.browserAPI?.general
                      ?.setLaunchAtLogin(next)
                      // The OS is authoritative: if it refused, show the truth.
                      .then((applied) => setGeneral('launchAtLogin', applied))
                      .catch(() => setGeneral('launchAtLogin', !next));
                  }}
                />
              </Row>
              <Row
                label="Restore previous session"
                description="Save your open tabs on exit so they can be reopened next launch. Private tabs are never saved."
              >
                <Switch
                  label="Restore previous session"
                  checked={restoreSession}
                  onChange={(next) => {
                    setRestoreSession(next);
                    // Turning it off contradicts "Continue where you left
                    // off", so fall back to the New Tab page.
                    if (!next && general.startupMode === 'continue') {
                      setGeneral('startupMode', 'new-tab');
                    }
                  }}
                />
              </Row>
            </div>
          </Panel>
        </Section>
      </Anchored>

      {/* ── 2. Search ──────────────────────────────────────────────────── */}
      <Anchored id="search" highlighted={highlight === 'search'}>
        <Section
          title="Search"
          description="Configure how the address bar and web searches behave."
        >
          <Panel>
            <Row
              label="Default search engine"
              description="Used for searches typed into the address bar."
              icon={Globe}
            >
              <Select
                label="Default search engine"
                value={searchEngineId}
                onChange={setSearchEngine}
                options={engines}
                className="w-52"
              />
            </Row>
            <Row
              label="Search suggestions"
              description="Get helpful suggestions while typing in the address bar."
            >
              <Switch
                label="Search suggestions"
                checked={general.searchSuggestions}
                onChange={set('searchSuggestions')}
              />
            </Row>
            <Row
              label="Show search history suggestions"
              description="Suggest pages you have visited before as you type."
            >
              <Switch
                label="Show search history suggestions"
                checked={general.searchHistorySuggestions}
                onChange={set('searchHistorySuggestions')}
                disabled={!general.searchSuggestions}
              />
            </Row>
            <Row
              label="Show bookmark suggestions"
              description="Suggest your bookmarks as you type in the address bar."
            >
              <Switch
                label="Show bookmark suggestions"
                checked={general.searchBookmarkSuggestions}
                onChange={set('searchBookmarkSuggestions')}
                disabled={!general.searchSuggestions}
              />
            </Row>
            <Row
              label="Search from address bar"
              description="Treat text that is not a web address as a search query."
            >
              <Switch
                label="Search from address bar"
                checked={general.searchFromAddressBar}
                onChange={set('searchFromAddressBar')}
              />
            </Row>
            <Row
              label="Open search results in a new tab"
              description="Keep the page you are on and open the results beside it."
            >
              <Switch
                label="Open search results in a new tab"
                checked={general.searchResultsInNewTab}
                onChange={set('searchResultsInNewTab')}
              />
            </Row>
            <Row
              label="Search engines"
              description="Add your own engines, or remove ones you do not use."
            >
              <Button onClick={onOpenSearchEngines}>Manage search engines</Button>
            </Row>
          </Panel>
        </Section>
      </Anchored>

      {/* ── 3. Navigation ──────────────────────────────────────────────── */}
      <Anchored id="navigation" highlighted={highlight === 'navigation'}>
        <Section title="Navigation">
          <Panel>
            <Row
              label="Open external links in a new tab"
              description="Links opened from other applications land in a new tab."
            >
              <Switch
                label="Open external links in a new tab"
                checked={general.externalLinkTarget === 'tab'}
                onChange={(next) => setGeneral('externalLinkTarget', next ? 'tab' : 'window')}
              />
            </Row>
            <Row
              label="Open external links in a new window"
              description="Links opened from other applications get their own window instead."
            >
              <Switch
                label="Open external links in a new window"
                checked={general.externalLinkTarget === 'window'}
                onChange={(next) => setGeneral('externalLinkTarget', next ? 'window' : 'tab')}
              />
            </Row>
            <Row
              label="Show full URL in address bar"
              description="Show the complete address instead of just the site name."
            >
              <Switch
                label="Show full URL in address bar"
                checked={general.showFullUrl}
                onChange={set('showFullUrl')}
              />
            </Row>
            <Row
              label="Enable smooth scrolling"
              description="Animate scrolling instead of jumping. Applies to new pages after a restart."
            >
              <Switch
                label="Enable smooth scrolling"
                checked={general.smoothScrolling}
                onChange={set('smoothScrolling')}
              />
            </Row>
            <Row
              label="Show loading indicator"
              description="Show progress in the tab strip while a page is loading."
            >
              <Switch
                label="Show loading indicator"
                checked={general.showLoadingIndicator}
                onChange={set('showLoadingIndicator')}
              />
            </Row>
          </Panel>
        </Section>
      </Anchored>

      {/* ── 4. Tabs ────────────────────────────────────────────────────── */}
      <Anchored id="tabs" highlighted={highlight === 'tabs'}>
        <Section title="Tabs" description="Control how tabs behave.">
          <Panel>
            <Row
              label="Open new tabs next to the current tab"
              description="New tabs appear beside the tab you opened them from."
            >
              <Switch
                label="Open new tabs next to the current tab"
                checked={general.openTabsNextToCurrent}
                onChange={set('openTabsNextToCurrent')}
              />
            </Row>
            <Row
              label="Switch to a new tab immediately"
              description="Focus a new tab as soon as it opens."
            >
              <Switch
                label="Switch to a new tab immediately"
                checked={general.switchToNewTab}
                onChange={set('switchToNewTab')}
              />
            </Row>
            <Row
              label="Show tab previews"
              description="Show the page title and address when hovering over a tab."
            >
              <Switch
                label="Show tab previews"
                checked={general.showTabPreviews}
                onChange={set('showTabPreviews')}
              />
            </Row>
            <Row
              label="Warn before closing multiple tabs"
              description="Ask for confirmation before closing several tabs at once."
            >
              <Switch
                label="Warn before closing multiple tabs"
                checked={general.warnClosingMultipleTabs}
                onChange={set('warnClosingMultipleTabs')}
              />
            </Row>
            <Row
              label="Reopen closed tabs"
              description="Keep recently closed tabs available with Ctrl+Shift+T."
            >
              <Switch
                label="Reopen closed tabs"
                checked={general.reopenClosedTabs}
                onChange={set('reopenClosedTabs')}
              />
            </Row>
            <Row
              label="Keep browser open when the last tab is closed"
              description="Show an empty New Tab page instead of quitting."
            >
              <Switch
                label="Keep browser open when the last tab is closed"
                checked={general.keepOpenOnLastTabClose}
                onChange={set('keepOpenOnLastTabClose')}
              />
            </Row>
            <Row
              label="Automatically discard inactive tabs"
              description="Free the memory used by background tabs you have not looked at in a while. Discarded tabs reload when you click them."
            >
              <Switch
                label="Automatically discard inactive tabs"
                checked={sleepTabs}
                onChange={setSleepTabs}
              />
            </Row>
            {sleepTabs && (
              <Row
                label="Discard after"
                description="How long a background tab must be idle before it is discarded."
              >
                <Select
                  label="Discard inactive tabs after"
                  value={String(sleepTabsAfterMinutes)}
                  onChange={(value) => setSleepTabsAfterMinutes(Number(value))}
                  options={DISCARD_PERIODS.map((minutes) => ({
                    id: String(minutes),
                    label: minutes < 60 ? `${minutes} minutes` : `${minutes / 60} hours`,
                  }))}
                  className="w-40"
                />
              </Row>
            )}
          </Panel>
        </Section>
      </Anchored>

      {/* ── 5. Home button ─────────────────────────────────────────────── */}
      <Anchored id="home" highlighted={highlight === 'home'}>
        <Section title="Home button">
          <Panel>
            <Row
              label="Show Home button on toolbar"
              description="Add a Home button next to the address bar."
            >
              <Switch
                label="Show Home button on toolbar"
                checked={general.showHomeButton}
                onChange={set('showHomeButton')}
              />
            </Row>
            {general.showHomeButton && (
              <>
                <div className="border-t border-[var(--border)]">
                  <RadioGroup
                    name="homepage-mode"
                    label="Homepage"
                    value={general.homepageMode}
                    onChange={set('homepageMode')}
                    options={[
                      { id: 'new-tab', label: 'New Tab page' },
                      { id: 'custom', label: 'Custom URL' },
                    ]}
                  />
                </div>
                {general.homepageMode === 'custom' && (
                  <Row label="Homepage address" stacked>
                    <TextInput
                      label="Homepage address"
                      value={homepageDraft}
                      onChange={(value) => {
                        setHomepageDraft(value);
                        if (homepageError) setHomepageError('');
                      }}
                      onEnter={handleHomepageCommit}
                      onBlur={handleHomepageCommit}
                      placeholder="example.com"
                      error={homepageError}
                    />
                  </Row>
                )}
              </>
            )}
          </Panel>
        </Section>
      </Anchored>

      {/* ── 6. Downloads ───────────────────────────────────────────────── */}
      <Anchored id="downloads" highlighted={highlight === 'downloads'}>
        <Section title="Downloads">
          <Panel>
            <Row label="Download location" description={downloadPath || 'Loading…'}>
              <Button
                icon={FolderOpen}
                onClick={async () => {
                  const picked = await window.browserAPI.downloads.pickFolder().catch(() => null);
                  if (picked) setDownloadPath(picked);
                }}
              >
                Change
              </Button>
            </Row>
            <Row
              label="Ask where to save each file"
              description="Show a save dialog for every download instead of using the folder above."
            >
              <Switch
                label="Ask where to save each file"
                checked={general.askWhereToSave}
                onChange={set('askWhereToSave')}
              />
            </Row>
            <Row
              label="Show download notifications"
              description="Notify me when a download finishes."
            >
              <Switch
                label="Show download notifications"
                checked={general.downloadNotifications}
                onChange={set('downloadNotifications')}
              />
            </Row>
            <Row
              label="Automatically open downloaded files"
              description="Open files with your system's default application as soon as they finish."
            >
              <Switch
                label="Automatically open downloaded files"
                checked={general.autoOpenDownloads}
                onChange={set('autoOpenDownloads')}
              />
            </Row>
            <Row
              label="Clear completed downloads from the download panel"
              description="Remove finished downloads from the list. The files themselves are kept."
            >
              <Switch
                label="Clear completed downloads from the download panel"
                checked={general.clearCompletedDownloads}
                onChange={set('clearCompletedDownloads')}
              />
            </Row>
          </Panel>
        </Section>
      </Anchored>

      {/* ── 7. Appearance ──────────────────────────────────────────────── */}
      <Anchored id="appearance" highlighted={highlight === 'appearance'}>
        <Section title="Appearance">
          <Panel>
            <Row label="Theme" description="Light, dark, or follow your system setting.">
              <Segmented label="Theme" value={theme} onChange={setTheme} options={THEME_OPTIONS} />
            </Row>
            <Row
              label="Show bookmarks bar"
              description="Keep your bookmarks visible under the address bar."
            >
              <Switch
                label="Show bookmarks bar"
                checked={general.showBookmarksBar}
                onChange={set('showBookmarksBar')}
              />
            </Row>
            <Row
              label="Show sidebar"
              description="Show the tab sidebar along the left edge of the window."
            >
              <Switch
                label="Show sidebar"
                checked={general.showSidebar}
                onChange={set('showSidebar')}
              />
            </Row>
            <Row label="Show home button" description="Mirrors the Home button setting above.">
              <Switch
                label="Show home button"
                checked={general.showHomeButton}
                onChange={set('showHomeButton')}
              />
            </Row>
            <Row
              label="Use compact toolbar"
              description="Reduce the height of the toolbar to fit more of the page."
            >
              <Switch
                label="Use compact toolbar"
                checked={general.compactToolbar}
                onChange={set('compactToolbar')}
              />
            </Row>
            <Row
              label="Show tab search button"
              description="Add a button that searches across your open tabs."
            >
              <Switch
                label="Show tab search button"
                checked={general.showTabSearchButton}
                onChange={set('showTabSearchButton')}
              />
            </Row>
          </Panel>
        </Section>
      </Anchored>

      {/* ── 8. Language & Region ───────────────────────────────────────── */}
      <Anchored id="language" highlighted={highlight === 'language'}>
        <Section title="Language & Region">
          <Panel>
            <Row label="Browser language" description="The language Zyphora asks websites to use.">
              <Select
                label="Browser language"
                value={general.browserLanguage}
                onChange={set('browserLanguage')}
                options={BROWSER_LANGUAGES}
                className="w-52"
              />
            </Row>
            <Row
              label="Offer to translate pages"
              description="Ask whether to translate pages written in another language."
            >
              <Switch
                label="Offer to translate pages"
                checked={general.offerTranslate}
                onChange={set('offerTranslate')}
              />
            </Row>
            <Row
              label="Automatically translate supported languages"
              description="Translate without asking when the language is one you do not read."
            >
              <Switch
                label="Automatically translate supported languages"
                checked={general.autoTranslate}
                onChange={set('autoTranslate')}
                disabled={!general.offerTranslate}
              />
            </Row>
            <Row
              label="Never translate these languages"
              description="Pages in these languages are always left in the original."
              stacked
            >
              <TagList
                values={general.neverTranslateLanguages}
                options={BROWSER_LANGUAGES}
                labelFor={(id) =>
                  BROWSER_LANGUAGES.find((language) => language.id === id)?.label ?? id
                }
                onAdd={addNeverTranslateLanguage}
                onRemove={removeNeverTranslateLanguage}
                emptyLabel="No exceptions yet."
              />
            </Row>
            <Row label="Region" description="Used for regional defaults such as units.">
              <Select
                label="Region"
                value={general.region}
                onChange={set('region')}
                options={REGIONS}
                className="w-52"
              />
            </Row>
            <Row label="Date format" description={`Example: ${formattedDate}`}>
              <Select
                label="Date format"
                value={general.dateFormat}
                onChange={(value) =>
                  setGeneral('dateFormat', value as GeneralSettings['dateFormat'])
                }
                options={DATE_FORMATS}
                className="w-52"
              />
            </Row>
            <Row label="Time format" description={`Example: ${formattedTime}`}>
              <Segmented
                label="Time format"
                value={general.timeFormat}
                onChange={set('timeFormat')}
                options={[
                  { id: '12h', label: '12-hour' },
                  { id: '24h', label: '24-hour' },
                ]}
              />
            </Row>
            <Row label="Number format" description="How large numbers are grouped.">
              <Select
                label="Number format"
                value={general.numberFormat}
                onChange={(value) =>
                  setGeneral('numberFormat', value as GeneralSettings['numberFormat'])
                }
                options={NUMBER_FORMATS}
                className="w-52"
              />
            </Row>
          </Panel>
        </Section>
      </Anchored>

      {/* ── 9. Accessibility ───────────────────────────────────────────── */}
      <Anchored id="accessibility" highlighted={highlight === 'accessibility'}>
        <Section title="Accessibility">
          <Panel className="mb-4">
            <Row
              label="Default font size"
              description="The size of text on pages that do not specify one."
            >
              <Slider
                label="Default font size"
                value={general.defaultFontSize}
                onChange={set('defaultFontSize')}
                min={FONT_SIZE_RANGE.min}
                max={FONT_SIZE_RANGE.max}
                format={(value) => `${value} px`}
              />
            </Row>
            <Row
              label="Minimum font size"
              description="Page text is never rendered smaller than this."
            >
              <Slider
                label="Minimum font size"
                value={general.minimumFontSize}
                onChange={set('minimumFontSize')}
                min={MIN_FONT_SIZE_RANGE.min}
                max={MIN_FONT_SIZE_RANGE.max}
                format={(value) => (value === 0 ? 'Off' : `${value} px`)}
              />
            </Row>
            <Row
              label="Default page zoom"
              description="Applied to pages you have not zoomed yourself."
            >
              <Select
                label="Default page zoom"
                value={String(general.defaultZoom)}
                onChange={(value) => setGeneral('defaultZoom', Number(value))}
                options={ZOOM_LEVELS.map((level) => ({
                  id: String(level),
                  label: `${Math.round(level * 100)}%`,
                }))}
                className="w-32"
              />
            </Row>
          </Panel>

          <Panel className="mb-4">
            <Row
              label="High contrast mode"
              description="Increase contrast throughout the browser interface."
            >
              <Switch
                label="High contrast mode"
                checked={general.highContrast}
                onChange={set('highContrast')}
              />
            </Row>
            <Row label="Reduce animations" description="Minimise motion in the browser interface.">
              <Switch
                label="Reduce animations"
                checked={general.reduceAnimations}
                onChange={set('reduceAnimations')}
              />
            </Row>
            <Row
              label="Always show focus indicator"
              description="Keep the keyboard focus ring visible even when using a mouse."
            >
              <Switch
                label="Always show focus indicator"
                checked={general.alwaysShowFocus}
                onChange={set('alwaysShowFocus')}
              />
            </Row>
          </Panel>

          <Panel>
            <Row
              label="Enable keyboard navigation"
              description="Move through the interface and page links using Tab and the arrow keys."
            >
              <Switch
                label="Enable keyboard navigation"
                checked={general.keyboardNavigation}
                onChange={set('keyboardNavigation')}
              />
            </Row>
            <Row
              label="Caret browsing"
              description="Navigate page text with a movable cursor. Toggle at any time with F7."
            >
              <Switch
                label="Caret browsing"
                checked={general.caretBrowsing}
                onChange={set('caretBrowsing')}
              />
            </Row>
          </Panel>
        </Section>
      </Anchored>

      {/* ── 10. Default browser ────────────────────────────────────────── */}
      <Anchored id="default-browser" highlighted={highlight === 'default-browser'}>
        <Section title="Default Browser">
          <Panel>
            <Row
              icon={isDefault ? Check : Globe}
              label={
                checking
                  ? 'Checking default browser…'
                  : isDefault
                    ? 'Zyphora is your default browser.'
                    : 'Zyphora is not your default browser.'
              }
              description={
                isDefault
                  ? 'Links you open in other applications are handled by Zyphora.'
                  : 'Set Zyphora as the default so links from other applications open here.'
              }
            >
              {!isDefault && !checking && (
                <Button variant="primary" onClick={makeDefault}>
                  Make Default
                </Button>
              )}
            </Row>
            {statusMessage && (
              <Row label={statusMessage} icon={TriangleAlert} description={undefined} />
            )}
          </Panel>
        </Section>
      </Anchored>

      {/* ── 11. Reset ──────────────────────────────────────────────────── */}
      <Anchored id="reset" highlighted={highlight === 'reset'}>
        <Section title="Reset" description="Restore browser settings to their original defaults.">
          <Panel>
            <Row
              label="Reset settings"
              description="Startup, search, navigation, tabs, downloads, appearance, language and accessibility preferences return to their defaults."
            >
              <Button variant="danger" onClick={() => setResetOpen(true)}>
                Reset Settings
              </Button>
            </Row>
            <Row
              label="Clear browsing data"
              description="Remove local history, cookies, cache and site storage. Opens the Clear Browsing Data page."
              icon={Trash2}
            >
              <Button onClick={onOpenClearData}>Clear browsing data</Button>
            </Row>
          </Panel>
        </Section>
      </Anchored>

      <ConfirmDialog
        open={resetOpen}
        danger
        title="Reset browser settings?"
        confirmLabel="Reset settings"
        onCancel={() => setResetOpen(false)}
        onConfirm={() => {
          resetBrowserSettings();
          setResetOpen(false);
        }}
        body={
          <div className="space-y-3">
            <p>These preferences will be restored to their defaults:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Startup behaviour and startup pages</li>
              <li>Default search engine and address-bar suggestions</li>
              <li>Navigation, tab and home-button behaviour</li>
              <li>Download prompts and notifications</li>
              <li>Theme, toolbar and sidebar appearance</li>
              <li>Language, region and accessibility settings</li>
            </ul>
            <p className="text-[var(--text)]">
              Your bookmarks, saved passwords, browsing history, downloaded files and AI memory are
              <strong> not </strong>
              affected. Those have their own separate actions.
            </p>
          </div>
        }
      />
    </div>
  );
};
