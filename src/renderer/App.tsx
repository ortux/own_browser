import { useEffect, useState } from 'react';
import { BrowserWindow } from './components/BrowserWindow';
import { AccountWelcome } from './components/AccountWelcome';
import { SplashScreen } from './components/SplashScreen';
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

  if (!hydrated) {
    return (
      <>
        <SplashScreen />
        <main className="flex min-h-screen w-full items-center justify-center bg-[var(--bg)] text-[var(--text-muted)]">
          <div className="flex items-center gap-3 text-sm">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--accent)]" />
            Loading Zyphora...
          </div>
        </main>
      </>
    );
  }

  if (!onboardingCompleted) {
    return (
      <>
        <SplashScreen />
        <OnboardingFlow onComplete={() => {}} />
      </>
    );
  }

  const shouldShowAccountPrompt = !account && !guestMode && (
    authPromptLastShownAt === null
    || Date.now() - authPromptLastShownAt >= AUTH_PROMPT_INTERVAL_MS
  );

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

  return (
    <>
      <SplashScreen />
      <BrowserWindow />
    </>
  );
}

export default App;
