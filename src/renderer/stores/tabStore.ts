import { create } from 'zustand';
import type { Tab, BrowserState } from '../../shared/types';

interface BrowserStore extends BrowserState {
  updateState: (state: BrowserState) => void;
  addTab: (tab: Tab) => void;
  removeTab: (tabId: string) => void;
  updateTab: (tabId: string, partial: Partial<Tab>) => void;
  setActiveTab: (tabId: string) => void;
}

export const useBrowserStore = create<BrowserStore>((set) => ({
  tabs: [],
  activeTabId: '',

  updateState: (state: BrowserState) => {
    set(state);
  },

  addTab: (tab: Tab) => {
    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabId: tab.id,
    }));
  },

  removeTab: (tabId: string) => {
    set((state) => {
      const newTabs = state.tabs.filter((t) => t.id !== tabId);
      const newActiveTabId =
        state.activeTabId === tabId ? (newTabs.length > 0 ? newTabs[0].id : '') : state.activeTabId;

      return {
        tabs: newTabs,
        activeTabId: newActiveTabId,
      };
    });
  },

  updateTab: (tabId: string, partial: Partial<Tab>) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, ...partial } : t)),
    }));
  },

  setActiveTab: (tabId: string) => {
    set({ activeTabId: tabId });
  },
}));
