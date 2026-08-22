import React from 'react';
import { ChevronLeft, ChevronRight, RotateCcw, X, Settings } from 'lucide-react';
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
    <div className="flex items-center gap-1 px-2 py-2 bg-gray-50 border-b border-gray-200">
      <button
        onClick={onBack}
        disabled={!activeTab?.canGoBack}
        className="p-2 rounded-lg hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        title="Go back (Alt+Left)"
      >
        <ChevronLeft size={18} />
      </button>

      <button
        onClick={onForward}
        disabled={!activeTab?.canGoForward}
        className="p-2 rounded-lg hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        title="Go forward (Alt+Right)"
      >
        <ChevronRight size={18} />
      </button>

      <div className="w-px h-6 bg-gray-300" />

      {activeTab?.loading ? (
        <button
          onClick={onStop}
          className="p-2 rounded-lg hover:bg-gray-200 transition-colors"
          title="Stop loading"
        >
          <X size={18} />
        </button>
      ) : (
        <button
          onClick={onReload}
          className="p-2 rounded-lg hover:bg-gray-200 transition-colors"
          title="Reload (Ctrl+R)"
        >
          <RotateCcw size={18} />
        </button>
      )}

      {/* Spacer pushes settings to the right */}
      <div className="flex-1" />

      <div className="w-px h-6 bg-gray-300" />

      <button
        onClick={onOpenSettings}
        className="p-2 rounded-lg hover:bg-gray-200 transition-colors text-gray-600"
        title="Settings"
      >
        <Settings size={18} />
      </button>
    </div>
  );
};
