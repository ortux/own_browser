import React from 'react';
import { X, Plus } from 'lucide-react';
import type { Tab } from '../../shared/types';
import { TabFavicon } from '../lib/fileIcon';

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string;
  onTabClick: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onNewTab: () => void;
}

export const TabBar: React.FC<TabBarProps> = ({
  tabs,
  activeTabId,
  onTabClick,
  onTabClose,
  onNewTab,
}) => {
  return (
    <div className="flex items-center gap-1 bg-white border-b border-gray-200 px-2 py-1 select-none overflow-x-auto">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          onClick={() => onTabClick(tab.id)}
          className={`flex items-center gap-2 px-3 py-2 rounded-t-lg cursor-pointer transition-colors min-w-max max-w-xs ${
            activeTabId === tab.id
              ? 'bg-white border-b-2 border-blue-500'
              : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
          }`}
        >
          <TabFavicon tab={tab} size={16} />
          <span className="truncate text-sm font-medium max-w-[120px]">
            {tab.title || 'New Tab'}
          </span>
          {tab.loading && (
            <div className="w-3 h-3 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onTabClose(tab.id);
            }}
            className="p-0.5 hover:bg-gray-300 rounded-sm transition-colors"
            title="Close tab"
          >
            <X size={14} />
          </button>
        </div>
      ))}

      <button
        onClick={onNewTab}
        className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-gray-200 transition-colors text-gray-600"
        title="New tab (Ctrl+T)"
      >
        <Plus size={18} />
      </button>
    </div>
  );
};
