import { useEffect, useState } from 'react';
import { BrowserWindow } from './components/BrowserWindow';
import { AccountWelcome } from './components/AccountWelcome';
import { OnboardingFlow } from './components/OnboardingFlow';
import { useSettingsStore } from './stores/settingsStore';
import { initHistorySync } from './lib/historySync';
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

  // Initialize history sync when authenticated
  useEffect(() => {
    if (!account) return;

    const cleanup = initHistorySync(5 * 60 * 1000); // Sync every 5 minutes
    return cleanup;
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
