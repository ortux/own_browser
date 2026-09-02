import React from 'react';
import { ChevronLeft, ChevronRight, RotateCcw, X, User } from 'lucide-react';
import type { Tab } from '../../shared/types';

interface ControlBarProps {
  activeTab: Tab | undefined;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onStop: () => void;
  onOpenSettings: () => void;
}

export const ControlBar: React.FC<ControlBarProps> = ({
  activeTab,
  onBack,
  onForward,
  onReload,
  onStop,
  onOpenSettings,
}) => {
  return (
    <div className="flex items-center gap-1 px-2 py-2 bg-[var(--chrome)] border-b border-[var(--border)]">
      <button
        onClick={onBack}
        disabled={!activeTab?.canGoBack}
        className="p-2 rounded-md hover:bg-[var(--hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-[var(--text-muted)]"
        title="Go back (Alt+Left)"
      >
        <ChevronLeft size={18} />
      </button>

      <button
        onClick={onForward}
        disabled={!activeTab?.canGoForward}
        className="p-2 rounded-md hover:bg-[var(--hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-[var(--text-muted)]"
        title="Go forward (Alt+Right)"
      >
        <ChevronRight size={18} />
      </button>

      <div className="w-px h-6 bg-[var(--border)]" />

      {activeTab?.loading ? (
        <button
          onClick={onStop}
          className="p-2 rounded-md hover:bg-[var(--hover)] transition-colors text-[var(--text-muted)]"
          title="Stop loading"
        >
          <X size={18} />
        </button>
      ) : (
        <button
          onClick={onReload}
          className="p-2 rounded-md hover:bg-[var(--hover)] transition-colors text-[var(--text-muted)]"
          title="Reload (Ctrl+R)"
        >
          <RotateCcw size={18} />
        </button>
      )}

      {/* Spacer pushes settings to the right */}
      <div className="flex-1" />

      <div className="w-px h-6 bg-[var(--border)]" />

      <button
        onClick={onOpenSettings}
        className="p-2 rounded-md hover:bg-[var(--hover)] transition-colors text-[var(--text-muted)]"
        title="Settings"
      >
        <User size={18} />
      </button>
    </div>
  );
};
