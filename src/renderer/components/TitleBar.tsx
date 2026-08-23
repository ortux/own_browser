import React from 'react';
import { Minus, Square, X } from 'lucide-react';

export const TitleBar: React.FC = () => {
  const minimize = () => window.browserAPI?.minimizeWindow();
  const maximize = () => window.browserAPI?.maximizeWindow();
  const close = () => window.browserAPI?.closeWindow();

  return (
    <div
      className="flex items-center h-9 shrink-0 bg-[var(--chrome)] border-b border-[var(--border)]"
      // @ts-ignore
      style={{ WebkitAppRegion: 'drag' }}
    >
      {/* Spacer fills the draggable area */}
      <div className="flex-1" />

      {/* Windows-style control buttons — no-drag so clicks register */}
      <div
        className="flex items-center h-full"
        // @ts-ignore
        style={{ WebkitAppRegion: 'no-drag' }}
      >
        <button
          onClick={minimize}
          className="flex items-center justify-center w-12 h-full text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--hover)] transition-colors"
          title="Minimize"
        >
          <Minus size={14} />
        </button>
        <button
          onClick={maximize}
          className="flex items-center justify-center w-12 h-full text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--hover)] transition-colors"
          title="Maximize / Restore"
        >
          <Square size={11} strokeWidth={1.5} />
        </button>
        <button
          onClick={close}
          className="flex items-center justify-center w-12 h-full text-[var(--text-muted)] hover:text-white hover:bg-red-600 transition-colors"
          title="Close"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
};
