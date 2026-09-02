import { create } from 'zustand';
import type { Tab, BrowserState } from '../../shared/types';

interface BrowserStore extends BrowserState {
  updateState: (state: BrowserState) => void;
  addTab: (tab: Tab) => void;
  removeTab: (tabId: string) => void;
  reorderTabs: (draggedTabId: string, targetTabId: string) => void;
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

  reorderTabs: (draggedTabId: string, targetTabId: string) => {
    set((state) => {
      const draggedIndex = state.tabs.findIndex((tab) => tab.id === draggedTabId);
      const targetIndex = state.tabs.findIndex((tab) => tab.id === targetTabId);
      if (draggedIndex < 0 || targetIndex < 0 || draggedIndex === targetIndex) return state;

      const tabs = [...state.tabs];
      const [draggedTab] = tabs.splice(draggedIndex, 1);
      tabs.splice(targetIndex, 0, draggedTab);
      return { tabs };
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
