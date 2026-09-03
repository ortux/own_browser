/**
 * panels.tsx — the non-General sections of Settings.
 *
 * These carry across the behaviour the previous single-file Settings page
 * already implemented (privacy, security, passwords, proxy, downloads,
 * account) and give each of them its own sidebar entry, using the same Row /
 * Panel / Section vocabulary as the General page so the whole surface reads as
 * one product.
 */

import React from 'react';
import {
  AlertTriangle,
  Check,
  Globe,
  Plus,
  RefreshCw,
  Blocks,
  Shield,
  ShieldCheck,
  Trash2,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import {
  Button,
  Callout,
  ConfirmDialog,
  EmptyState,
  Panel,
  Row,
  Section,
  Select,
  Switch,
  TextInput,
} from './SettingsUi';
import {
  SEARCH_ENGINES,
  accountDisplayName,
  useSettingsStore,
  type SecuritySettings,
} from '../../stores/settingsStore';
import { useProxy } from '../../hooks/useProxy';
import { invalidateHistory } from '../../hooks/useHistory';
import type { AuthPortalMode } from '../AuthPortal';

// ─── Privacy ─────────────────────────────────────────────────────────────────

export const PrivacyPanel: React.FC = () => {
  const stripTrackingParams = useSettingsStore((s) => s.stripTrackingParams);
  const setStripTrackingParams = useSettingsStore((s) => s.setStripTrackingParams);
  const historyRetentionDays = useSettingsStore((s) => s.historyRetentionDays);
  const setHistoryRetentionDays = useSettingsStore((s) => s.setHistoryRetentionDays);
  const doNotTrack = useSettingsStore((s) => s.security.doNotTrack);
  const privateByDefault = useSettingsStore((s) => s.security.privateByDefault);
  const setSecurityFlag = useSettingsStore((s) => s.setSecurityFlag);
  const [dnsMode, setDnsMode] = React.useState<'automatic' | 'secure'>('automatic');

  React.useEffect(() => {
    window.browserAPI.dns
      .getMode()
      .then(setDnsMode)
      .catch(() => {});
  }, []);

  return (
    <>
      <Section title="Privacy" description="What Zyphora reveals about you while you browse.">
        <Panel>
          <Row
            label="Remove tracking parameters"
            description="Strip utm_, gclid, fbclid and similar tags from addresses before loading them."
          >
            <Switch
              label="Remove tracking parameters"
              checked={stripTrackingParams}
              onChange={setStripTrackingParams}
            />
          </Row>
          <Row
            label="Send Do Not Track"
            description="Request that sites do not track your activity."
          >
            <Switch
              label="Send Do Not Track"
              checked={doNotTrack}
              onChange={(next) => setSecurityFlag('doNotTrack', next)}
            />
          </Row>
          <Row
            label="Private tabs by default"
            description="Open new tabs without saving history or cookies."
          >
            <Switch
              label="Private tabs by default"
              checked={privateByDefault}
              onChange={(next) => setSecurityFlag('privateByDefault', next)}
            />
          </Row>
          <Row
            label="Strict private DNS"
            description="Resolve every name through encrypted DNS-over-HTTPS, with no fallback. Takes effect after a restart."
          >
            <Switch
              label="Strict private DNS"
              checked={dnsMode === 'secure'}
              onChange={(next) => {
                const mode = next ? 'secure' : 'automatic';
                setDnsMode(mode);
                window.browserAPI.dns.setMode(mode).catch(() => {});
              }}
            />
          </Row>
          <Row
            label="History retention"
            description="Older entries are removed automatically at startup."
          >
            <Select
              label="History retention"
              value={String(historyRetentionDays)}
              onChange={(value) => setHistoryRetentionDays(Number(value))}
              options={[
                { id: '30', label: '30 days' },
                { id: '90', label: '90 days' },
                { id: '365', label: '1 year' },
                { id: '0', label: 'Forever' },
              ]}
              className="w-40"
            />
          </Row>
        </Panel>
      </Section>
    </>
  );
};

// ─── Security ────────────────────────────────────────────────────────────────

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
];

export const SecurityPanel: React.FC = () => {
  const security = useSettingsStore((s) => s.security);
  const setSecurityFlag = useSettingsStore((s) => s.setSecurityFlag);
  const [stats, setStats] = React.useState({ enabled: true, blocked: 0 });

  React.useEffect(() => {
    window.browserAPI.adblock
      .stats()
      .then(setStats)
      .catch(() => {});
    return window.browserAPI.onAdblockStats(setStats);
  }, []);

  return (
    <Section title="Security" description="Protections applied to every page you load.">
      <Panel className="mb-4">
        {SECURITY_OPTIONS.map((option) => (
          <Row key={option.key} label={option.label} description={option.desc}>
            <Switch
              label={option.label}
              checked={security[option.key]}
              onChange={(next) => setSecurityFlag(option.key, next)}
            />
          </Row>
        ))}
      </Panel>

      <Panel>
        <Row
          icon={Shield}
          label={stats.enabled ? 'Ad blocker active' : 'Ad blocker off'}
          description="AdGuard DNS blocks known domains first. The local filter engine then blocks matching URLs and resource requests that DNS cannot see."
        >
          <span className="text-[12.5px] tabular-nums text-[var(--text-muted)]">
            {stats.blocked.toLocaleString()} blocked
          </span>
        </Row>
      </Panel>
    </Section>
  );
};

// ─── Site permissions ────────────────────────────────────────────────────────

const PERMISSION_LABELS: Record<string, string> = {
  media: 'Camera & microphone',
  geolocation: 'Location',
  notifications: 'Notifications',
  clipboard: 'Clipboard',
  midi: 'MIDI devices',
  fullscreen: 'Full screen',
  'display-capture': 'Screen sharing',
};

export const SitePermissionsPanel: React.FC = () => {
  const [entries, setEntries] = React.useState<Record<string, Record<string, boolean>>>({});
  const [confirmReset, setConfirmReset] = React.useState(false);

  const load = React.useCallback(() => {
    window.browserAPI.permissions
      .list()
      .then(setEntries)
      .catch(() => setEntries({}));
  }, []);

  React.useEffect(load, [load]);

  const hosts = Object.keys(entries).sort();

  return (
    <Section
      title="Site Permissions"
      description="Decisions you have made for camera, microphone, location and other capabilities."
      action={
        hosts.length > 0 ? (
          <Button variant="danger" onClick={() => setConfirmReset(true)}>
            Reset all
          </Button>
        ) : undefined
      }
    >
      <Panel>
        {hosts.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="No site permissions yet"
            description="When a site asks for your camera, microphone or location, your answer is remembered here."
          />
        ) : (
          hosts.map((host) => (
            <Row
              key={host}
              icon={Globe}
              label={host}
              description={Object.entries(entries[host])
                .map(
                  ([permission, allowed]) =>
                    `${PERMISSION_LABELS[permission] ?? permission}: ${allowed ? 'Allowed' : 'Blocked'}`
                )
                .join(' · ')}
              stacked={false}
            >
              <Button
                variant="ghost"
                icon={Trash2}
                onClick={async () => {
                  for (const permission of Object.keys(entries[host])) {
                    await window.browserAPI.permissions.clear(host, permission).catch(() => {});
                  }
                  load();
                }}
              >
                Forget
              </Button>
            </Row>
          ))
        )}
      </Panel>

      <ConfirmDialog
        open={confirmReset}
        danger
        title="Reset all site permissions?"
        body="Every site will ask again the next time it needs your camera, microphone, location or notifications."
        confirmLabel="Reset permissions"
        onCancel={() => setConfirmReset(false)}
        onConfirm={async () => {
          await window.browserAPI.permissions.resetAll().catch(() => {});
          setConfirmReset(false);
          load();
        }}
      />
    </Section>
  );
};

// ─── Passwords ───────────────────────────────────────────────────────────────

export const PasswordsPanel: React.FC = () => {
  const passwordManagerEnabled = useSettingsStore((s) => s.passwordManagerEnabled);
  const setPasswordManagerEnabled = useSettingsStore((s) => s.setPasswordManagerEnabled);
  const [count, setCount] = React.useState<number | null>(null);
  const [status, setStatus] = React.useState('');
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    void window.browserAPI?.passwords
      .getAll()
      .then((entries) => !cancelled && setCount(entries.length))
      .catch(() => !cancelled && setCount(0));
    return () => {
      cancelled = true;
    };
  }, [passwordManagerEnabled]);

  return (
    <Section title="Passwords" description="Logins saved on this device.">
      <Panel>
        <Row
          label="Password manager"
          description="Offer to save logins and fill them back in. Stored on this device only — passwords are never synced to your account."
        >
          <Switch
            label="Password manager"
            checked={passwordManagerEnabled}
            onChange={setPasswordManagerEnabled}
          />
        </Row>
        <Row
          label="Saved passwords"
          description={
            count === null
              ? 'Counting…'
              : `${count} saved ${count === 1 ? 'login' : 'logins'} on this device.`
          }
        >
          <Button variant="danger" disabled={!count} onClick={() => setConfirmDelete(true)}>
            Delete all
          </Button>
        </Row>
      </Panel>

      {status && (
        <div className="mt-3">
          <Callout tone="info">{status}</Callout>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        danger
        title="Delete every saved password?"
        body="All logins stored on this device are permanently removed. This cannot be undone."
        confirmLabel="Delete passwords"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          try {
            await window.browserAPI.passwords.clear();
            setCount(0);
            setStatus('All saved passwords deleted.');
          } catch {
            setStatus('Could not delete saved passwords.');
          }
          setConfirmDelete(false);
        }}
      />
    </Section>
  );
};

// ─── Clear browsing data ─────────────────────────────────────────────────────

export const ClearDataPanel: React.FC = () => {
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState('');
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  return (
    <Section
      title="Clear Browsing Data"
      description="Remove what Zyphora has stored about the sites you have visited."
    >
      <Panel>
        <Row
          icon={Trash2}
          label="History, cookies, cache and site storage"
          description="Applies to the default session. Saved passwords, bookmarks and downloaded files are not affected."
        >
          <Button variant="danger" disabled={busy} onClick={() => setConfirmOpen(true)}>
            {busy ? 'Clearing…' : 'Clear data'}
          </Button>
        </Row>
      </Panel>

      {status && (
        <div className="mt-3">
          <Callout tone="info">{status}</Callout>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        danger
        title="Clear browsing data?"
        body="Local history, cookies, cache and site storage are removed. You will be signed out of most websites. Bookmarks, saved passwords and downloaded files are kept."
        confirmLabel="Clear data"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={async () => {
          setConfirmOpen(false);
          setBusy(true);
          setStatus('');
          try {
            await window.browserAPI.privacy.clearData();
            // History lives behind a cached hook; without this the history
            // panel keeps offering entries that were just erased.
            invalidateHistory();
            setStatus('Browsing data cleared.');
          } catch {
            setStatus('Could not clear browsing data.');
          } finally {
            setBusy(false);
          }
        }}
      />
    </Section>
  );
};

// ─── Search engines ──────────────────────────────────────────────────────────

function engineFavicon(url: string): string | null {
  try {
    const parsed = new URL(url.replace(/%s/gi, ''));
    return `${parsed.protocol}//${parsed.hostname}/favicon.ico`;
  } catch {
    return null;
  }
}

export const SearchEnginesPanel: React.FC = () => {
  const searchEngineId = useSettingsStore((s) => s.searchEngineId);
  const setSearchEngine = useSettingsStore((s) => s.setSearchEngine);
  const customSearchEngines = useSettingsStore((s) => s.customSearchEngines);
  const addCustomSearchEngine = useSettingsStore((s) => s.addCustomSearchEngine);
  const removeCustomSearchEngine = useSettingsStore((s) => s.removeCustomSearchEngine);

  const [adding, setAdding] = React.useState(false);
  const [name, setName] = React.useState('');
  const [url, setUrl] = React.useState('');
  const [error, setError] = React.useState('');

  const engines = [...SEARCH_ENGINES, ...customSearchEngines];

  const commit = () => {
    if (!addCustomSearchEngine(name, url)) {
      setError('The URL must start with http(s):// and contain the %s query placeholder.');
      return;
    }
    setAdding(false);
    setName('');
    setUrl('');
    setError('');
  };

  return (
    <Section
      title="Search"
      description="The engines available from the address bar. The selected one is used for plain searches."
      action={
        !adding ? (
          <Button icon={Plus} onClick={() => setAdding(true)}>
            Add engine
          </Button>
        ) : undefined
      }
    >
      <Panel className="mb-4">
        {engines.map((engine) => {
          const active = engine.id === searchEngineId;
          const favicon = engineFavicon(engine.url);
          return (
            <div
              key={engine.id}
              className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3 last:border-b-0"
            >
              <button
                type="button"
                onClick={() => setSearchEngine(engine.id)}
                aria-pressed={active}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)]">
                  {favicon ? (
                    <img
                      src={favicon}
                      alt=""
                      className="h-4 w-4 rounded"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <Globe size={15} className="text-[var(--text-faint)]" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block text-[14px] text-[var(--text)]">{engine.name}</span>
                  <span className="block truncate text-[12.5px] text-[var(--text-muted)]">
                    {engine.url.split('?')[0]}
                  </span>
                </span>
              </button>
              {active && <Check size={16} className="shrink-0 text-[var(--accent-fg)]" />}
              {engine.id.startsWith('custom-') && (
                <button
                  type="button"
                  onClick={() => removeCustomSearchEngine(engine.id)}
                  aria-label={`Remove ${engine.name}`}
                  className="rounded p-1.5 text-[var(--text-faint)] hover:bg-[var(--hover)] hover:text-[var(--danger)]"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          );
        })}
      </Panel>

      {adding && (
        <Panel>
          <Row label="Name" stacked>
            <TextInput
              label="Engine name"
              value={name}
              onChange={setName}
              placeholder="My Search"
            />
          </Row>
          <Row label="Search URL" description="Use %s where the query should go." stacked>
            <TextInput
              label="Search URL"
              value={url}
              onChange={setUrl}
              onEnter={commit}
              placeholder="https://example.com/search?q=%s"
              error={error}
              monospace
            />
          </Row>
          <div className="flex justify-end gap-2 px-4 py-3">
            <Button
              variant="ghost"
              onClick={() => {
                setAdding(false);
                setError('');
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" onClick={commit}>
              Add engine
            </Button>
          </div>
        </Panel>
      )}
    </Section>
  );
};

// ─── Downloads ───────────────────────────────────────────────────────────────

export const DownloadsPanel: React.FC = () => {
  const downloadPath = useSettingsStore((s) => s.downloadPath);
  const setDownloadPath = useSettingsStore((s) => s.setDownloadPath);
  const openDownloadsOnStart = useSettingsStore((s) => s.openDownloadsOnStart);
  const setOpenDownloadsOnStart = useSettingsStore((s) => s.setOpenDownloadsOnStart);
  const general = useSettingsStore((s) => s.general);
  const setGeneral = useSettingsStore((s) => s.setGeneral);

  return (
    <Section title="Downloads" description="Where files go and what happens when they arrive.">
      <Panel>
        <Row label="Download location" description={downloadPath || 'Loading…'}>
          <Button
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
          description="Show a save dialog for every download."
        >
          <Switch
            label="Ask where to save each file"
            checked={general.askWhereToSave}
            onChange={(next) => setGeneral('askWhereToSave', next)}
          />
        </Row>
        <Row label="Show download notifications" description="Notify me when a download finishes.">
          <Switch
            label="Show download notifications"
            checked={general.downloadNotifications}
            onChange={(next) => setGeneral('downloadNotifications', next)}
          />
        </Row>
        <Row
          label="Automatically open downloaded files"
          description="Open files as soon as they finish downloading."
        >
          <Switch
            label="Automatically open downloaded files"
            checked={general.autoOpenDownloads}
            onChange={(next) => setGeneral('autoOpenDownloads', next)}
          />
        </Row>
        <Row
          label="Open the Downloads page on a new download"
          description="Switch to the Downloads page whenever a download starts."
        >
          <Switch
            label="Open the Downloads page on a new download"
            checked={openDownloadsOnStart}
            onChange={setOpenDownloadsOnStart}
          />
        </Row>
        <Row label="Downloads folder" description="Open the folder your files are saved to.">
          <Button onClick={() => window.browserAPI.downloads.revealFolder().catch(() => {})}>
            Open folder
          </Button>
        </Row>
      </Panel>
    </Section>
  );
};

// ─── Performance (proxy + tab sleeping + new tab mode) ───────────────────────

export const PerformancePanel: React.FC = () => {
  const sleepTabs = useSettingsStore((s) => s.sleepTabs);
  const setSleepTabs = useSettingsStore((s) => s.setSleepTabs);
  const sleepTabsAfterMinutes = useSettingsStore((s) => s.sleepTabsAfterMinutes);
  const setSleepTabsAfterMinutes = useSettingsStore((s) => s.setSleepTabsAfterMinutes);
  const browserMode = useSettingsStore((s) => s.browserMode);
  const setBrowserMode = useSettingsStore((s) => s.setBrowserMode);
  const newTabMode = useSettingsStore((s) => s.newTabMode);
  const setNewTabMode = useSettingsStore((s) => s.setNewTabMode);

  const {
    proxy,
    proxyEnabled,
    status: proxyStatus,
    error: proxyError,
    fetchAndApply,
    toggle: toggleProxy,
  } = useProxy();

  return (
    <>
      <Section title="Performance" description="How much of your machine Zyphora uses.">
        <Panel>
          <Row
            label="Sleep idle tabs"
            description="Free the memory used by background tabs you have not looked at in a while."
          >
            <Switch label="Sleep idle tabs" checked={sleepTabs} onChange={setSleepTabs} />
          </Row>
          {sleepTabs && (
            <Row label="Sleep after" description="Idle time before a background tab is suspended.">
              <Select
                label="Sleep after"
                value={String(sleepTabsAfterMinutes)}
                onChange={(value) => setSleepTabsAfterMinutes(Number(value))}
                options={[15, 30, 60, 120, 240].map((minutes) => ({
                  id: String(minutes),
                  label: minutes < 60 ? `${minutes} minutes` : `${minutes / 60} hours`,
                }))}
                className="w-40"
              />
            </Row>
          )}
          <Row
            label="Browser mode"
            description="Minimal hides heavier subsystems, including the AI agent, and never loads them."
          >
            <Select
              label="Browser mode"
              value={browserMode}
              onChange={(value) => setBrowserMode(value as 'minimal' | 'full')}
              options={[
                { id: 'minimal', label: 'Minimal' },
                { id: 'full', label: 'Full' },
              ]}
              className="w-40"
            />
          </Row>
          <Row
            label="New tab page"
            description="Full includes a fresh background image, clock and search."
          >
            <Select
              label="New tab page"
              value={newTabMode}
              onChange={(value) => setNewTabMode(value as 'minimal' | 'full')}
              options={[
                { id: 'minimal', label: 'Minimal' },
                { id: 'full', label: 'Full' },
              ]}
              className="w-40"
            />
          </Row>
        </Panel>
      </Section>

      <Section
        title="Proxy"
        description="Route browser traffic through a configured anonymous proxy."
      >
        <Panel>
          <Row
            icon={proxyEnabled ? Wifi : WifiOff}
            label={proxyEnabled ? 'Proxy enabled' : 'No proxy — using direct connection'}
            description="Public proxies may be slow, blocked by some sites, or go offline without notice."
          >
            <Switch
              label="Enable proxy"
              checked={proxyEnabled}
              onChange={toggleProxy}
              disabled={proxyStatus === 'fetching' || proxyStatus === 'verifying'}
            />
          </Row>
          {(proxyStatus === 'fetching' || proxyStatus === 'verifying') && (
            <Row
              icon={RefreshCw}
              label={proxyStatus === 'fetching' ? 'Fetching proxy…' : 'Verifying connection…'}
            />
          )}
          {proxyStatus === 'failed' && proxyError && (
            <Row icon={AlertTriangle} danger label={proxyError} />
          )}
          {proxyEnabled && proxy && proxyStatus === 'active' && (
            <Row
              label={`Connected via ${proxy.ipPort}`}
              description={`${proxy.country} · ${proxy.type.toUpperCase()} · ${proxy.proxyLevel} · ${proxy.speed}s`}
            >
              <Button icon={RefreshCw} onClick={fetchAndApply}>
                Rotate
              </Button>
            </Row>
          )}
        </Panel>
      </Section>
    </>
  );
};

// ─── Sync / account ──────────────────────────────────────────────────────────

export const SyncPanel: React.FC<{ onOpenAuth: (mode: AuthPortalMode) => void }> = ({
  onOpenAuth,
}) => {
  const account = useSettingsStore((s) => s.account);
  const authError = useSettingsStore((s) => s.authError);
  const signOut = useSettingsStore((s) => s.signOut);

  return (
    <Section
      title="Sync"
      description="Sign in to keep bookmarks and history in step across your devices."
    >
      <Panel>
        {account ? (
          <>
            <Row label={accountDisplayName(account)} description={account.email}>
              <Button onClick={() => void signOut()}>Sign out</Button>
            </Row>
            {account.role && <Row label="Role" description={account.role} />}
          </>
        ) : (
          <Row
            label="Not signed in"
            description="Your settings stay on this device until you sign in."
          >
            <div className="flex gap-2">
              <Button variant="primary" onClick={() => onOpenAuth('signin')}>
                Log in
              </Button>
              <Button onClick={() => onOpenAuth('signup')}>Sign up</Button>
            </div>
          </Row>
        )}
      </Panel>
      {authError && (
        <div className="mt-3">
          <Callout tone="danger">{authError}</Callout>
        </div>
      )}
    </Section>
  );
};

// ─── Extensions / updates / about ────────────────────────────────────────────

export const ExtensionsPanel: React.FC = () => (
  <Section title="Extensions" description="Add-ons that extend what the browser can do.">
    <Panel>
      <EmptyState
        icon={Blocks}
        title="Extensions are not available yet"
        description="Zyphora does not load third-party extensions. Ad and tracker blocking is built in and configured under Security."
      />
    </Panel>
  </Section>
);

export const UpdatesPanel: React.FC = () => {
  const [checkedAt, setCheckedAt] = React.useState<Date | null>(null);
  const version = window.navigator.userAgent.match(/Electron\/([\d.]+)/)?.[1] ?? 'unknown';

  return (
    <Section title="Updates" description="Keep Zyphora current.">
      <Panel>
        <Row
          label="Zyphora is up to date"
          description={
            checkedAt
              ? `Last checked ${checkedAt.toLocaleTimeString()}. Updates are delivered with your installed build (Electron ${version}).`
              : `Updates are delivered with your installed build (Electron ${version}).`
          }
        >
          <Button onClick={() => setCheckedAt(new Date())}>Check for updates</Button>
        </Row>
      </Panel>
    </Section>
  );
};

export const AboutPanel: React.FC = () => {
  const chrome = window.navigator.userAgent.match(/Chrome\/([\d.]+)/)?.[1] ?? 'unknown';
  const electron = window.navigator.userAgent.match(/Electron\/([\d.]+)/)?.[1] ?? 'unknown';

  return (
    <Section title="About" description="What this copy of Zyphora is built from.">
      <Panel>
        <Row label="Zyphora" description="A secure, privacy-focused desktop web browser." />
        <Row label="Engine" description={`Chromium ${chrome}`} />
        <Row label="Runtime" description={`Electron ${electron}`} />
        <Row label="Platform" description={window.navigator.platform} />
      </Panel>
    </Section>
  );
};
