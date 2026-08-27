import React, { useEffect, useState } from 'react';
import { ArrowLeft, Activity } from 'lucide-react';
import type { DiagnosticsInfo } from '../../shared/types';

interface DiagnosticsPageProps {
  onBack: () => void;
}

function formatBytes(n: number): string {
  if (!n || n < 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5">
      <span className="text-sm text-[var(--text-muted)]">{label}</span>
      <span className="text-sm text-[var(--text)] text-right break-all">{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[var(--text-faint)]">{title}</h2>
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
        {children}
      </div>
    </section>
  );
}

export const DiagnosticsPage: React.FC<DiagnosticsPageProps> = ({ onBack }) => {
  const [info, setInfo] = useState<DiagnosticsInfo | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    window.browserAPI.diagnostics.get().then(setInfo).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : String(e));
    });
  }, []);

  return (
    <div className="h-full w-full overflow-y-auto bg-[var(--bg)] text-[var(--text)]">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={onBack}
            className="p-2 rounded-lg hover:bg-[var(--hover)] text-[var(--text-muted)] transition-colors"
            title="Back"
            aria-label="Back"
          >
            <ArrowLeft size={18} />
          </button>
          <Activity size={20} className="text-[var(--text-muted)]" />
          <h1 className="text-xl font-semibold">Diagnostics</h1>
        </div>

        <p className="mb-6 text-xs text-[var(--text-faint)]">
          Local snapshot of this installation — nothing here is sent anywhere. Useful for bug reports.
        </p>

        {error && <p className="text-sm text-red-400">Could not load diagnostics: {error}</p>}
        {!info && !error && <p className="text-sm text-[var(--text-faint)]">Loading…</p>}

        {info && (
          <>
            <Section title="Versions">
              <Row label="Zyphora" value={info.versions.app} />
              <Row label="Electron" value={info.versions.electron} />
              <Row label="Chromium" value={info.versions.chrome} />
              <Row label="Node.js" value={info.versions.node} />
              <Row label="Platform" value={info.versions.platform} />
            </Section>

            <Section title="Privacy engine">
              <Row label="Ad blocker" value={info.adblock.enabled ? 'Enabled' : 'Disabled'} />
              <Row label="Blocked this session" value={info.adblock.blockedThisSession} />
              <Row
                label="Filter-list cache"
                value={info.adblock.cacheExists
                  ? `Present (${info.adblock.cacheAgeDays ?? '?'} day(s) old)`
                  : 'Not built yet'}
              />
              <Row label="Allowlisted sites" value={info.adblock.allowlistSize} />
              <Row label="DNS-over-HTTPS" value={`${info.dns.mode} — ${info.dns.endpoint}`} />
              <Row label="WebRTC policy" value={info.startupPolicy.webrtcPolicy} />
              <Row
                label="Third-party cookies"
                value={info.startupPolicy.blockThirdPartyCookies ? 'Blocked' : 'Allowed'}
              />
            </Section>

            <Section title="Network">
              <Row label="Proxy" value={info.proxy.configured ? `Active (${info.proxy.rules ?? '?'})` : 'Direct connection'} />
            </Section>

            <Section title="Local data">
              <Row label="Database size" value={formatBytes(info.db.sizeBytes)} />
              <Row label="Encrypted at rest" value={info.db.encrypted ? 'Yes (AES-256-GCM, OS keychain)' : 'No (safeStorage unavailable)'} />
              <Row label="Database path" value={<span className="font-mono text-xs">{info.db.path}</span>} />
            </Section>

            <Section title="Updates">
              <Row label="Supported" value={info.updates.supported ? 'Yes' : 'No (dev build or missing publish config)'} />
              <Row label="State" value={info.updates.state} />
              {info.updates.version && <Row label="Available version" value={info.updates.version} />}
              {info.updates.error && <Row label="Last error" value={info.updates.error} />}
            </Section>
          </>
        )}
      </div>
    </div>
  );
};
