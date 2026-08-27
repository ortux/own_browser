import React from 'react';
import { X } from 'lucide-react';

interface ShortcutCheatsheetProps {
  onClose: () => void;
}

const GROUPS: { title: string; shortcuts: [string, string][] }[] = [
  {
    title: 'Tabs',
    shortcuts: [
      ['Ctrl+T', 'New tab'],
      ['Ctrl+Shift+T', 'Reopen recently closed tab'],
      ['Ctrl+W', 'Close tab'],
      ['Ctrl+Tab', 'Next tab'],
      ['Ctrl+Shift+Tab', 'Previous tab'],
      ['Ctrl+1 … Ctrl+8', 'Jump to tab N'],
      ['Ctrl+9', 'Last tab'],
    ],
  },
  {
    title: 'Navigation & pages',
    shortcuts: [
      ['Alt+← / Alt+→', 'Back / forward'],
      ['Ctrl+R or F5', 'Reload'],
      ['Ctrl+F', 'Find in page'],
      ['Ctrl+D', 'Bookmark page'],
      ['Ctrl+P', 'Print page'],
      ['Ctrl+J', 'Downloads'],
      ['F11', 'Fullscreen'],
      ['Ctrl+Shift+I', 'Developer tools (page)'],
    ],
  },
  {
    title: 'Address bar & zoom',
    shortcuts: [
      ['Ctrl+L', 'Focus address bar'],
      ['Ctrl+K', 'Command palette'],
      ['"g cats"', 'Search with a keyword (ddg, g, bing, bravy, eco, sp)'],
      ['Ctrl + / Ctrl −', 'Zoom in / out'],
      ['Ctrl+0', 'Reset zoom'],
    ],
  },
  {
    title: 'Browser',
    shortcuts: [
      ['Ctrl+,', 'Settings'],
      ['Ctrl+/', 'This cheat sheet'],
      ['Esc', 'Close overlays'],
    ],
  },
];

export const ShortcutCheatsheet: React.FC<ShortcutCheatsheetProps> = ({ onClose }) => (
  <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
    <div
      className="w-[620px] max-w-[92vw] max-h-[80vh] overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[0_24px_80px_rgba(0,0,0,0.5)] p-6"
      style={{ animation: 'popIn 140ms ease-out' }}
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--text)]">Keyboard shortcuts</h2>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-[var(--hover)] text-[var(--text-muted)]" aria-label="Close">
          <X size={16} />
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {GROUPS.map((group) => (
          <section key={group.title}>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[var(--text-faint)]">{group.title}</h3>
            <ul className="space-y-1.5">
              {group.shortcuts.map(([keys, label]) => (
                <li key={keys} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-[var(--text-muted)]">{label}</span>
                  <kbd className="shrink-0 rounded bg-[var(--surface-2)] border border-[var(--border)] px-1.5 py-0.5 text-[11px] text-[var(--text-muted)]">
                    {keys}
                  </kbd>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  </div>
);
