import { useEffect, useState } from 'react';
import { BrowserWindow } from './components/BrowserWindow';
import { AccountWelcome } from './components/AccountWelcome';
import { useSettingsStore } from './stores/settingsStore';
import './styles/index.css';

const AUTH_PROMPT_INTERVAL_MS = 90 * 24 * 60 * 60 * 1000;

function App() {
  const account = useSettingsStore((state) => state.account);
  const authPromptLastShownAt = useSettingsStore((state) => state.authPromptLastShownAt);
  const markAuthPromptShown = useSettingsStore((state) => state.markAuthPromptShown);
  const [hydrated, setHydrated] = useState(useSettingsStore.persist.hasHydrated());

    const unsubscribe = useSettingsStore.persist.onFinishHydration(() => setHydrated(true));
    const fallback = window.setTimeout(() => setHydrated(true), 1500);
    return () => {
      window.clearTimeout(fallback);
      unsubscribe();
    };
  }, []);

  if (!hydrated) {
    return (
      <main className="flex min-h-screen w-full items-center justify-center bg-[var(--bg)] text-[var(--text-muted)]">
        <div className="flex items-center gap-3 text-sm">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--accent)]" />
          Loading Zyphora...
        </div>
      </main>
    );
  }

  const shouldShowAccountPrompt = !account && (
    authPromptLastShownAt === null
    || Date.now() - authPromptLastShownAt >= AUTH_PROMPT_INTERVAL_MS
  );

  if (shouldShowAccountPrompt) {
    return <AccountWelcome onContinue={() => markAuthPromptShown()} />;
  }

  return <BrowserWindow />;
}

export default App;
