import React, { useCallback, useEffect, useState } from 'react';
import { RotateCcw, X, Globe } from 'lucide-react';
import type { Tab } from '../../shared/types';

interface RecentlyClosedPanelProps {
  onRestore: (index: number) => void | Promise<unknown>;
  onClose: () => void;
}

export const RecentlyClosedPanel: React.FC<RecentlyClosedPanelProps> = ({ onRestore, onClose }) => {
  const [tabs, setTabs] = useState<Tab[]>([]);

  const load = useCallback(async () => {
    try {
      const result = await window.browserAPI.sendMessage({ type: 'get-closed-tabs' });
      setTabs(Array.isArray(result) ? result as Tab[] : []);
    } catch {
      setTabs([]);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="flex h-full flex-col border-l border-[var(--border)] bg-[var(--surface)]">
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-center gap-2 text-[var(--text)]">
          <RotateCcw size={15} />
          <span className="text-sm font-semibold">Recently closed</span>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1.5 text-[var(--text-faint)] transition-colors hover:bg-[var(--hover)]"
          title="Close"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {tabs.length === 0 ? (
          <p className="py-8 text-center text-xs text-[var(--text-faint)]">No recently closed tabs</p>
        ) : (
          tabs.map((tab, index) => (
            <button
              key={`${tab.id}-${index}`}
              onClick={async () => { await onRestore(index); await load(); }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-[var(--hover)]"
              title={tab.url}
            >
              <Globe size={15} className="shrink-0 text-[var(--text-faint)]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-[var(--text)]">{tab.title || 'New Tab'}</span>
                <span className="block truncate text-[11px] text-[var(--text-faint)]">{tab.url}</span>
              </span>
              <RotateCcw size={13} className="shrink-0 text-[var(--text-faint)]" />
            </button>
          ))
        )}
      </div>
    </div>
  );
};
