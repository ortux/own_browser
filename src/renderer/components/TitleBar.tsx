import React from 'react';
import { Minus, Square, X } from 'lucide-react';
import appIcon from '../../../public/icon.png';

export const TitleBar: React.FC = () => {
  const minimize = () => window.browserAPI?.minimizeWindow();
  const maximize = () => window.browserAPI?.maximizeWindow();
  const close    = () => window.browserAPI?.closeWindow();

  return (
    <div
      className="flex items-center h-9 shrink-0 bg-[var(--chrome)] border-b border-[var(--border)]"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Branding — no-drag so it doesn't interfere with double-click-to-maximise */}
      <div
        className="pl-4 flex items-center gap-2"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {/* App logo */}
        <img
          src={appIcon}
          alt="Zyphora"
          width={16}
          height={16}
          className="shrink-0 rounded"
          draggable={false}
        />
        <span
          className="text-[13px] font-semibold tracking-wide text-[var(--text)]"
          style={{ fontFamily: '"Poppins", sans-serif', letterSpacing: '0.06em' }}
        >
          Zyphora
        </span>
      </div>

      {/* Drag spacer */}
      <div className="flex-1" />

      {/* Windows controls — no-drag */}
      <div
        className="flex items-center h-full"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
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
