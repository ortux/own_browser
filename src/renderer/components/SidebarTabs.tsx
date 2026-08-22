import React, { useState } from 'react';
import { X, Plus, Globe } from 'lucide-react';
import type { Tab } from '../../shared/types';

interface SidebarTabsProps {
  tabs: Tab[];
  activeTabId: string;
  onTabClick: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onNewTab: () => void;
}

export const SidebarTabs: React.FC<SidebarTabsProps> = ({
  tabs,
  activeTabId,
  onTabClick,
  onTabClose,
  onNewTab,
}) => {
  const [hovered, setHovered] = useState(false);
  const expanded = hovered;

  return (
    <div
      className="flex flex-col h-full bg-[#171717] transition-all duration-200 ease-in-out overflow-hidden shrink-0 select-none z-10"
      style={{ width: expanded ? '220px' : '48px' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Drag region at top — matches TitleBar height */}
      <div
        className="h-9 shrink-0 border-b border-white/10"
        // @ts-ignore
        style={{ WebkitAppRegion: 'drag' }}
      />

      {/* Tab list */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-1">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              onClick={() => onTabClick(tab.id)}
              className={`group flex items-center gap-2.5 mx-1.5 my-0.5 rounded-lg cursor-pointer transition-colors ${
                isActive
                  ? 'bg-white/15 text-white'
                  : 'text-white/60 hover:bg-white/10 hover:text-white/90'
              }`}
              style={{
                padding: expanded ? '7px 8px' : '7px 0',
                justifyContent: expanded ? 'flex-start' : 'center',
              }}
              title={expanded ? undefined : tab.title || 'New Tab'}
            >
              {/* Favicon / spinner / globe */}
              <div className="shrink-0 w-4 h-4 flex items-center justify-center">
                {tab.loading ? (
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
                ) : tab.favicon ? (
                  <img
                    src={tab.favicon}
                    alt=""
                    className="w-4 h-4 rounded-sm"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <Globe size={14} className="text-white/40" />
                )}
              </div>

              {/* Title + close — only when expanded */}
              {expanded && (
                <>
                  <span className="flex-1 truncate text-sm leading-none">
                    {tab.title || 'New Tab'}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onTabClose(tab.id);
                    }}
                    className="shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-white/20 transition-all"
                    title="Close tab"
                  >
                    <X size={13} />
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* New tab button */}
      <div className="shrink-0 px-1.5 pb-3 pt-1 border-t border-white/10">
        <button
          onClick={onNewTab}
          className={`flex items-center gap-2.5 w-full rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors ${
            expanded ? 'px-2 py-2' : 'justify-center py-2'
          }`}
          title={expanded ? undefined : 'New tab (Ctrl+T)'}
        >
          <Plus size={16} className="shrink-0" />
          {expanded && <span className="text-sm">New tab</span>}
        </button>
      </div>
    </div>
  );
};
