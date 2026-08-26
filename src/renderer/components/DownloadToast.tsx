import React, { useEffect, useState } from 'react';
import { Download, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import type { Download as DownloadRecord } from '../../shared/types';

interface Toast {
  id: string;
  filename: string;
  percent: number;
  state: DownloadRecord['state'];
}

interface DownloadToastProps {
  onOpenDownloads?: () => void;
}

/**
 * Global, non-blocking notification shown whenever a website kicks off a
 * download. Slides in with an animation, shows live progress, and auto-dismisses
 * shortly after the download reaches a terminal state.
 */
export const DownloadToast: React.FC<DownloadToastProps> = ({ onOpenDownloads }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const unsubStart = window.browserAPI.downloads.onStarted((d) => {
      setToasts((prev) =>
        prev.some((t) => t.id === d.id)
          ? prev
          : [...prev, { id: d.id, filename: d.filename, percent: 0, state: d.state }]
      );
    });

    const unsubUpd = window.browserAPI.downloads.onUpdated((list) => {
      setToasts((prev) => {
        if (prev.length === 0) return prev;
        const map = new Map(list.map((d) => [d.id, d]));
        let changed = false;
        const next = prev.filter((toast) => map.has(toast.id)).map((t) => {
          const d = map.get(t.id);
          if (!d) return t;
          if (d.percent !== t.percent || d.state !== t.state) changed = true;
          return { ...t, percent: d.percent, state: d.state };
        });
        if (next.length !== prev.length) changed = true;
        return changed ? next : prev;
      });
    });

    return () => {
      unsubStart();
      unsubUpd();
    };
  }, []);

  // Auto-dismiss toasts that have finished (completed / canceled / interrupted).
  useEffect(() => {
    const finished = toasts.filter((t) => t.state !== 'progressing');
    const timers = finished.map((t) =>
      setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== t.id));
      }, 4000)
    );
    return () => timers.forEach(clearTimeout);
  }, [toasts]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-72 pointer-events-none">
      {toasts.map((t) => {
        const finished = t.state !== 'progressing';
        const failed = t.state === 'interrupted';
        const pct = Math.round(t.percent * 100);

        return (
          <div
            key={t.id}
            onClick={onOpenDownloads}
            className="pointer-events-auto cursor-pointer rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-lg px-3.5 py-3 flex items-center gap-3"
            style={{ animation: 'toastIn 260ms cubic-bezier(0.22, 1, 0.36, 1)' }}
          >
            {finished ? (
              failed ? (
                <XCircle size={22} className="shrink-0 text-[#ef4444]" />
              ) : t.state === 'canceled' ? (
                <AlertCircle size={22} className="shrink-0 text-[var(--text-faint)]" />
              ) : (
                <CheckCircle2 size={22} className="shrink-0 text-green-400" />
              )
            ) : (
              <Download
                size={22}
                className="shrink-0 text-[var(--accent)]"
                style={{ animation: 'toastPulse 1.1s ease-in-out infinite' }}
              />
            )}

            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-[var(--text)] truncate">
                {t.filename}
              </div>
              <div className="text-xs text-[var(--text-faint)]">
                {finished
                  ? failed
                    ? t.state === 'canceled'
                      ? 'Canceled'
                      : 'Failed'
                    : 'Download complete'
                  : `Downloading… ${pct}%`}
              </div>
              {!finished && (
                <div className="mt-1.5 h-1 rounded-full bg-[var(--surface-2)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-200"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
