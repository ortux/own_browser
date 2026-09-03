import { useEffect, useState } from 'react';
import { BrowserWindow } from './components/BrowserWindow';
import { AccountWelcome } from './components/AccountWelcome';
import { OnboardingFlow } from './components/OnboardingFlow';
import { useSettingsStore } from './stores/settingsStore';
import { initHistorySync, syncHistoryWithDevice } from './lib/historySync';
import { initBookmarksSync, syncBookmarksWithDevice } from './lib/bookmarksSync';
import { offlineQueue, onSyncQueue } from './lib/offlineQueue';
import './styles/index.css';

const AUTH_PROMPT_INTERVAL_MS = 90 * 24 * 60 * 60 * 1000;

function App() {
  const account = useSettingsStore((state) => state.account);
  const guestMode = useSettingsStore((state) => state.guestMode);
  const onboardingCompleted = useSettingsStore((state) => state.onboardingCompleted);
  const authPromptLastShownAt = useSettingsStore((state) => state.authPromptLastShownAt);
  const markAuthPromptShown = useSettingsStore((state) => state.markAuthPromptShown);
  const chooseGuest = useSettingsStore((state) => state.chooseGuest);
  const [hydrated, setHydrated] = useState(useSettingsStore.persist.hasHydrated());

  useEffect(() => {
    const unsubscribe = useSettingsStore.persist.onFinishHydration(() => setHydrated(true));
    const fallback = window.setTimeout(() => setHydrated(true), 1500);
    return () => {
      window.clearTimeout(fallback);
      unsubscribe();
    };
  }, []);

  // Initialize history and bookmark sync when authenticated. Bookmark sync was
  // fully implemented but never started, so bookmarks silently never synced.
  useEffect(() => {
    if (!account) return;

    const stopHistorySync = initHistorySync(5 * 60 * 1000); // Sync every 5 minutes
    const stopBookmarksSync = initBookmarksSync(5 * 60 * 1000);
    return () => {
      stopHistorySync();
      stopBookmarksSync();
    };
  }, [account]);

  // Drain anything queued while offline or signed out. Without a registered
  // handler the queue only ever grew and shed its oldest entries.
  useEffect(() => {
    if (!account) return;

    return onSyncQueue(async (operations) => {
      const processed: string[] = [];
      for (const operation of operations) {
        try {
          // Settings have no server-side endpoint yet, so those entries are
          // dropped rather than retried forever.
          if (operation.type === 'history') {
            await syncHistoryWithDevice({ batch: true });
          } else if (operation.type === 'bookmark') {
            await syncBookmarksWithDevice();
          }
          processed.push(operation.id);
        } catch (error) {
          offlineQueue.markOperationFailed(
            operation.id,
            error instanceof Error ? error.message : 'sync failed'
          );
        }
      }
      return processed;
    });
  }, [account]);

  // Hydration is near-instant from local storage. Rendering a bare surface
  // avoids a flash of loading UI that is gone before it can be read.
  if (!hydrated) {
    return <main className="min-h-screen w-full bg-[var(--bg)]" />;
  }

  if (!onboardingCompleted) {
    return <OnboardingFlow onComplete={() => {}} />;
  }

  const shouldShowAccountPrompt =
    !account &&
    !guestMode &&
    (authPromptLastShownAt === null ||
      Date.now() - authPromptLastShownAt >= AUTH_PROMPT_INTERVAL_MS);

  if (shouldShowAccountPrompt) {
    return (
      <AccountWelcome
        onContinue={(choice) => {
          markAuthPromptShown();
          if (choice === 'guest') chooseGuest();
        }}
      />
    );
  }

  return <BrowserWindow />;
}

export default App;
