import React, { useState, useMemo } from 'react';
import {
  X,
  Plus,
  Bookmark,
  History,
  Layers,
  Search,
  Settings,
  User,
  ChevronDown,
  RotateCcw,
} from 'lucide-react';
import type { Tab } from '../../shared/types';
import { useSettingsStore } from '../stores/settingsStore';
import { TabFavicon } from '../lib/fileIcon';

interface SidebarTabsProps {
  tabs: Tab[];
  activeTabId: string;
  onTabClick: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onTabReorder: (draggedTabId: string, targetTabId: string) => void;
  onNewTab: () => void;
  onOpenSettings: () => void;
  onOpenHistory: () => void;
  onOpenBookmarks: () => void;
  onOpenRecentlyClosed: () => void;
}

const COLLAPSED_W = 48;
const EXPANDED_W  = 240;

// ── Avatar component ─────────────────────────────────────────────────────────
const Avatar: React.FC<{ name: string; image?: string; size?: number }> = ({
  name, image, size = 28,
}) => {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  if (image) {
    return (
      <img
        src={image}
        alt={name}
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-full bg-[var(--accent)] text-white flex items-center justify-center text-[11px] font-semibold shrink-0"
      style={{ width: size, height: size }}
    >
      {initials || <User size={12} />}
    </div>
  );
};

// ── Main sidebar ─────────────────────────────────────────────────────────────
export const SidebarTabs: React.FC<SidebarTabsProps> = ({
  tabs,
  activeTabId,
  onTabClick,
  onTabClose,
  onTabReorder,
  onNewTab,
  onOpenSettings,
  onOpenHistory,
  onOpenBookmarks,
  onOpenRecentlyClosed,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [tabSearch, setTabSearch] = useState('');
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const account = useSettingsStore((s) => s.account);

  const filteredTabs = useMemo(() => {
    const q = tabSearch.toLowerCase().trim();
    if (!q) return tabs;
    return tabs.filter(
      (t) =>
        (t.title || 'New Tab').toLowerCase().includes(q) ||
        t.url.toLowerCase().includes(q)
    );
  }, [tabs, tabSearch]);

  const iconBtn = (icon: React.ReactNode, label: string, onClick?: () => void) => (
    <button
      key={label}
      onClick={onClick}
      title={label}
      className="flex items-center justify-center w-full py-2.5 text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--hover)] rounded-lg transition-colors"
    >
      {icon}
    </button>
  );

  return (
    <div
      className="flex flex-col h-full bg-[var(--chrome)] border-r border-[var(--border)] shrink-0 select-none z-10 overflow-hidden transition-[width] duration-200 ease-in-out"
      style={{ width: expanded ? `${EXPANDED_W}px` : `${COLLAPSED_W}px` }}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => { setExpanded(false); setTabSearch(''); }}
    >
      {/* Drag region */}
      <div
        className="h-9 shrink-0 border-b border-[var(--border)]"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />

      {/* ══════════ COLLAPSED ══════════ */}
      {!expanded && (
        <div className="flex flex-col flex-1 px-1.5 py-2 gap-0.5 overflow-hidden">
          {iconBtn(<Plus size={16} />,     'New Tab',    onNewTab)}
          {iconBtn(<Layers size={15} />,   'Tab Groups')}
          {iconBtn(<Bookmark size={15} />,  'Bookmarks',        onOpenBookmarks)}
          {iconBtn(<History size={15} />,    'History',           onOpenHistory)}
          {iconBtn(<RotateCcw size={15} />,  'Recently closed',   onOpenRecentlyClosed)}

          <div className="my-1 h-px bg-[var(--border)] mx-1" />

          {/* Tab favicons */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col gap-0.5">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => onTabClick(tab.id)}
                title={tab.title || 'New Tab'}
                className={`flex items-center justify-center w-full py-2 rounded-lg transition-colors ${
                  tab.id === activeTabId ? 'bg-[var(--hover)]' : 'hover:bg-[var(--hover)]'
                }`}
              >
                <TabFavicon tab={tab} size={14} />
              </button>
            ))}
          </div>

          {/* Bottom icons: profile + settings */}
          <div className="shrink-0 pt-1 border-t border-[var(--border)] flex flex-col gap-0.5">
            <button
              onClick={onOpenSettings}
              title={account ? account.name : 'Profile'}
              className="flex items-center justify-center w-full py-2 rounded-lg hover:bg-[var(--hover)] transition-colors"
            >
              {account
                ? <Avatar name={account.name ?? account.email ?? 'User'} image={account.image} size={22} />
                : <User size={15} className="text-[var(--text-muted)]" />
              }
            </button>
            {iconBtn(<Settings size={15} />, 'Settings', onOpenSettings)}
          </div>
        </div>
      )}

      {/* ══════════ EXPANDED ══════════ */}
      {expanded && (
        <>
          {/* Top nav */}
          <div className="px-2 pt-2 pb-1 shrink-0 space-y-0.5">
            <button
              onClick={onNewTab}
              className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium bg-[var(--hover)] text-[var(--text)] transition-colors"
            >
              <Plus size={15} className="shrink-0 opacity-70" />
              New Tab
            </button>
            {([
              { icon: <Layers size={14} />,   label: 'Tab Groups',  onClick: undefined as (() => void) | undefined },
              { icon: <Bookmark size={14} />, label: 'Bookmarks',       onClick: onOpenBookmarks as (() => void) | undefined },
              { icon: <History size={14} />,  label: 'History',          onClick: onOpenHistory as (() => void) | undefined },
              { icon: <RotateCcw size={14} />, label: 'Recently closed', onClick: onOpenRecentlyClosed as (() => void) | undefined },
            ]).map(({ icon, label, onClick }) => (
              <button
                key={label}
                onClick={onClick}
                className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-[var(--text-muted)] hover:bg-[var(--hover)] hover:text-[var(--text)] transition-colors"
              >
                <span className="shrink-0 opacity-70">{icon}</span>
                {label}
              </button>
            ))}
          </div>

          <div className="mx-3 my-1.5 h-px bg-[var(--border)] shrink-0" />

          {/* Tab search */}
          <div className="px-2 pb-1 shrink-0">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] focus-within:border-[var(--accent)] transition-colors">
              <Search size={13} className="text-[var(--text-faint)] shrink-0" />
              <input
                type="text"
                value={tabSearch}
                onChange={(e) => setTabSearch(e.target.value)}
                placeholder="Search tabs…"
                className="flex-1 bg-transparent text-sm text-[var(--text)] placeholder-[var(--text-faint)] outline-none min-w-0"
                style={{ WebkitUserSelect: 'text', userSelect: 'text' }}
              />
              {tabSearch && (
                <button onClick={() => setTabSearch('')}
                  className="text-[var(--text-faint)] hover:text-[var(--text)]">
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Active Tabs label */}
          <div className="px-3 pt-1 pb-0.5 shrink-0 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-faint)]">
              Active Tabs
            </span>
            <span className="text-[11px] text-[var(--text-faint)]">{tabs.length}</span>
          </div>

          {/* Scrollable tab list */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-2 min-h-0">
            {filteredTabs.length === 0 && tabSearch && (
              <p className="px-3 py-4 text-xs text-[var(--text-faint)] text-center">
                No tabs match
              </p>
            )}
            {filteredTabs.map((tab) => {
              const isActive = tab.id === activeTabId;
              return (
                <div
                  key={tab.id}
                  draggable
                  onClick={() => onTabClick(tab.id)}
                  onDragStart={(event) => {
                    setDraggedTabId(tab.id);
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', tab.id);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const draggedId = event.dataTransfer.getData('text/plain') || draggedTabId;
                    if (draggedId) onTabReorder(draggedId, tab.id);
                    setDraggedTabId(null);
                  }}
                  onDragEnd={() => setDraggedTabId(null)}
                  className={`group flex items-center gap-2.5 px-3 py-2 my-0.5 rounded-lg cursor-pointer transition-colors ${
                    isActive
                      ? 'bg-[var(--hover)] text-[var(--text)]'
                      : 'text-[var(--text-muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]'
                  }`}
                >
                  <div className="shrink-0 w-4 h-4 flex items-center justify-center">
                    <TabFavicon tab={tab} size={14} />
                  </div>
                  <span className="flex-1 truncate text-sm leading-none">
                    {tab.title || 'New Tab'}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); onTabClose(tab.id); }}
                    className="shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-[var(--border-strong)] transition-all"
                    title="Close tab"
                  >
                    <X size={12} />
                  </button>
                </div>
              );
            })}
          </div>

          {/* ── Bottom footer: profile + settings ── */}
          <div className="shrink-0 border-t border-[var(--border)] px-2 py-2 space-y-1">

            {/* Profile row */}
            <button
              onClick={onOpenSettings}
              className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg hover:bg-[var(--hover)] transition-colors group"
            >
              {account
                ? <Avatar name={account.name ?? account.email ?? 'User'} image={account.image} size={26} />
                : (
                  <div className="w-[26px] h-[26px] rounded-full border border-[var(--border)] flex items-center justify-center shrink-0">
                    <User size={13} className="text-[var(--text-muted)]" />
                  </div>
                )
              }
              <div className="flex-1 text-left min-w-0">
                <p className="text-sm font-medium text-[var(--text)] truncate leading-none">
                  {account ? account.name : 'Guest'}
                </p>
                <p className="text-[11px] text-[var(--text-faint)] mt-0.5 truncate leading-none">
                  {account ? 'Signed in' : 'Not signed in'}
                </p>
              </div>
              <ChevronDown size={13} className="shrink-0 text-[var(--text-faint)] opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>

            {/* Settings */}
            <button
              onClick={onOpenSettings}
              className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-[var(--text-muted)] hover:bg-[var(--hover)] hover:text-[var(--text)] transition-colors"
            >
              <Settings size={14} className="shrink-0 opacity-70" />
              <span className="font-medium">Settings</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
};
