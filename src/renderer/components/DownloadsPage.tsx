import React, { useEffect, useState, useCallback } from 'react';
import {
  Download as DownloadIcon,
  File,
  FolderOpen,
  ExternalLink,
  X,
  Trash2,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Ban,
} from 'lucide-react';
import type { Download } from '../../shared/types';
import { useSettingsStore } from '../stores/settingsStore';

function formatBytes(n: number): string {
  if (!n || n < 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

function statusMeta(d: Download): { label: string; icon: React.ElementType; tone: string } {
  switch (d.state) {
    case 'completed':
      return { label: 'Completed', icon: CheckCircle2, tone: 'text-green-400' };
    case 'interrupted':
      return { label: 'Failed', icon: AlertCircle, tone: 'text-[#ef4444]' };
    case 'canceled':
      return { label: 'Canceled', icon: XCircle, tone: 'text-[var(--text-faint)]' };
    default:
      return { label: 'Downloading', icon: DownloadIcon, tone: 'text-[var(--accent)]' };
  }
}

export const DownloadsPage: React.FC = () => {
  const [downloads, setDownloads] = useState<Download[]>([]);
  const downloadPath = useSettingsStore((s) => s.downloadPath);

  const refresh = useCallback(async () => {
    try {
      const list = await window.browserAPI.downloads.list();
      setDownloads(list);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    refresh();
    const unsub = window.browserAPI.downloads.onUpdated(setDownloads);
    return unsub;
  }, [refresh]);

  const handleClear = () => window.browserAPI.downloads.clear().then(refresh).catch(() => {});

  return (
    <div className="h-full w-full overflow-y-auto bg-[var(--bg)] text-[var(--text)]">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 p-10">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <DownloadIcon size={26} className="text-[var(--accent)]" />
            <div>
              <h1 className="text-2xl font-semibold">Downloads</h1>
              <p className="text-xs text-[var(--text-faint)]">
                {downloadPath ? `Saving to ${downloadPath}` : 'Default downloads folder'}
              </p>
            </div>
          </div>
          {downloads.length > 0 && (
            <button
              onClick={handleClear}
              className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-muted)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text)]"
            >
              <Trash2 size={15} /> Clear list
            </button>
          )}
        </div>

        {/* List */}
        {downloads.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[var(--border)] py-16 text-[var(--text-faint)]">
            <DownloadIcon size={32} />
            <p className="text-sm">No downloads yet</p>
            <p className="text-xs">
              Files you download will appear here. Press{' '}
              <kbd className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-[11px] text-[var(--text-muted)]">
                Ctrl + J
              </kbd>{' '}
              to open this page anytime.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {downloads.map((d) => {
              const meta = statusMeta(d);
              const StatusIcon = meta.icon;
              const pct = Math.round(d.percent * 100);
              const showBar = d.state === 'progressing';
              return (
                <div
                  key={d.id}
                  className="flex items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 transition-colors hover:border-[var(--border-strong)]"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-2)]">
                    <File size={18} className="text-[var(--text-muted)]" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium" title={d.filename}>
                        {d.filename}
                      </span>
                      <StatusIcon size={14} className={`shrink-0 ${meta.tone}`} />
                    </div>

                    <div className="mt-0.5 flex items-center gap-2 text-xs text-[var(--text-faint)]">
                      <span>{meta.label}</span>
                      <span>·</span>
                      <span>
                        {formatBytes(d.receivedBytes)}
                        {d.totalBytes > 0 && ` / ${formatBytes(d.totalBytes)}`}
                        {showBar && ` (${pct}%)`}
                      </span>
                    </div>

                    {/* Progress bar */}
                    {showBar && (
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
                        <div
                          className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-200"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex shrink-0 items-center gap-1">
                    {d.state === 'progressing' && (
                      <button
                        onClick={() => window.browserAPI.downloads.cancel(d.id).catch(() => {})}
                        title="Cancel"
                        className="rounded-lg p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text)]"
                      >
                        <Ban size={16} />
                      </button>
                    )}
                    {d.state === 'completed' && (
                      <>
                        <button
                          onClick={() => window.browserAPI.downloads.open(d.id).catch(() => {})}
                          title="Open file"
                          className="rounded-lg p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text)]"
                        >
                          <ExternalLink size={16} />
                        </button>
                        <button
                          onClick={() => window.browserAPI.downloads.show(d.id).catch(() => {})}
                          title="Show in folder"
                          className="rounded-lg p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text)]"
                        >
                          <FolderOpen size={16} />
                        </button>
                      </>
                    )}
                    <button
                      onClick={() =>
                        window.browserAPI.downloads.remove(d.id).then(refresh).catch(() => {})
                      }
                      title="Remove from list"
                      className="rounded-lg p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--hover)] hover:text-[#ef4444]"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
