import React from 'react';
import { X, Check } from 'lucide-react';
import { useSettingsStore, SEARCH_ENGINES } from '../stores/settingsStore';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { searchEngineId, setSearchEngine } = useSettingsStore();

  if (!isOpen) return null;

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Panel — stop clicks propagating to backdrop */}
      <div
        className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl border border-gray-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800">Settings</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
            title="Close settings"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
            Search Engine
          </h3>
          <div className="flex flex-col gap-2">
            {SEARCH_ENGINES.map((engine) => {
              const isActive = searchEngineId === engine.id;
              return (
                <button
                  key={engine.id}
                  onClick={() => setSearchEngine(engine.id)}
                  className={`flex items-center justify-between w-full px-4 py-3 rounded-xl border transition-all text-left ${
                    isActive
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  <div>
                    <span className="font-medium">{engine.name}</span>
                    <span className="ml-3 text-xs text-gray-400">{engine.url.split('?')[0]}</span>
                  </div>
                  {isActive && <Check size={16} className="text-blue-500 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-5">
          <p className="text-xs text-gray-400">
            Settings are saved automatically and persist across sessions.
          </p>
        </div>
      </div>
    </div>
  );
};
