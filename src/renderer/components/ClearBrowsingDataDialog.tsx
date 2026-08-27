import React, { useState } from 'react';
import { Trash2, X } from 'lucide-react';

interface ClearBrowsingDataDialogProps {
  onClose: () => void;
  onDone: (cleared: string[]) => void;
}

const TIME_RANGES: { id: string; label: string; hours: number }[] = [
  { id: 'hour', label: 'Last hour', hours: 1 },
  { id: 'day', label: 'Last 24 hours', hours: 24 },
  { id: 'week', label: 'Last 7 days', hours: 24 * 7 },
  { id: 'all', label: 'All time', hours: 0 },
];

const TARGETS: { key: string; label: string; desc: string }[] = [
  { key: 'history', label: 'Browsing history', desc: 'Pages you visited, with titles.' },
  { key: 'cookies', label: 'Cookies and other site data', desc: 'Signs you out of sites. Clears for all time.' },
  { key: 'cache', label: 'Cached images and files', desc: 'Frees disk space; sites load slower once. Clears for all time.' },
  { key: 'permissions', label: 'Site permissions', desc: 'Saved allow/deny decisions for camera, location, etc.' },
  { key: 'downloads', label: 'Download history', desc: 'The records list — files on disk are kept.' },
  { key: 'blockedStats', label: 'Ad-blocker statistics', desc: 'Blocked-request counters for this session.' },
];

export const ClearBrowsingDataDialog: React.FC<ClearBrowsingDataDialogProps> = ({ onClose, onDone }) => {
  const [range, setRange] = useState('hour');
  const [targets, setTargets] = useState<Record<string, boolean>>({ history: true, cookies: false, cache: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const toggle = (key: string) => setTargets((t) => ({ ...t, [key]: !t[key] }));
  const anySelected = Object.values(targets).some(Boolean);

  const clear = async () => {
    if (!anySelected || busy) return;
    setBusy(true);
    setError('');
    try {
      const hours = TIME_RANGES.find((r) => r.id === range)?.hours ?? 0;
      const result = await window.browserAPI.privacy.clearDataSelective({
        since: hours > 0 ? Date.now() - hours * 3_600_000 : 0,
        targets,
      });
      onDone(result.cleared ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not clear data.');
      setBusy(false);
    }
  };

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true" aria-label="Clear browsing data">
      <div className="w-[440px] max-h-[80vh] overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[0_24px_60px_rgba(0,0,0,0.45)] p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold text-[var(--text)]">Clear browsing data</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-[var(--hover)] text-[var(--text-muted)]" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <p className="text-xs text-[var(--text-faint)] mb-4">Deletes data on this device only. Nothing is synced anywhere.</p>

        <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-faint)] mb-1" htmlFor="cbd-range">Time range</label>
        <select
          id="cbd-range"
          value={range}
          onChange={(e) => setRange(e.target.value)}
          className="w-full mb-4 rounded-xl bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text)] outline-none border border-[var(--border)]"
        >
          {TIME_RANGES.map((r) => (
            <option key={r.id} value={r.id}>{r.label}</option>
          ))}
        </select>

        <div className="space-y-1">
          {TARGETS.map((target) => (
            <button
              key={target.key}
              type="button"
              onClick={() => toggle(target.key)}
              className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-[var(--hover)] transition-colors"
              role="checkbox"
              aria-checked={targets[target.key] === true}
            >
              <span
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                  targets[target.key] ? 'border-[var(--accent)] bg-[var(--accent)]' : 'border-[var(--border-strong)]'
                }`}
              >
                {targets[target.key] && <svg viewBox="0 0 12 12" className="h-3 w-3 text-white" fill="none"><path d="M2 6l3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              </span>
              <span className="min-w-0">
                <span className="block text-sm text-[var(--text)]">{target.label}</span>
                <span className="block text-xs text-[var(--text-faint)]">{target.desc}</span>
              </span>
            </button>
          ))}
        </div>

        {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-muted)] hover:bg-[var(--hover)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => void clear()}
            disabled={!anySelected || busy}
            className="flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm text-white hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            <Trash2 size={14} />
            {busy ? 'Clearing…' : 'Clear data'}
          </button>
        </div>
      </div>
    </div>
  );
};
