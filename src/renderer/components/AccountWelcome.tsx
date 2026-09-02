import React, { useState } from 'react';
import { Cloud, LockKeyhole, UserRound } from 'lucide-react';
import { AuthPortal } from './AuthPortal';
import { useSettingsStore } from '../stores/settingsStore';

interface AccountWelcomeProps {
  onContinue: (choice: 'signin' | 'signup' | 'guest') => void;
}

export const AccountWelcome: React.FC<AccountWelcomeProps> = ({ onContinue }) => {
  const [authMode, setAuthMode] = useState<'signin' | 'signup' | null>(null);
  const chooseGuest = useSettingsStore((s) => s.chooseGuest);

  const handleAuthClose = () => {
    // If user signed in successfully, proceed; otherwise go back to choices
    const account = useSettingsStore.getState().account;
    if (account) {
      onContinue(authMode ?? 'signin');
    } else {
      setAuthMode(null);
    }
  };

  // Show the full AuthPortal (same as Settings page) when a mode is chosen
  if (authMode) {
    return (
      <div className="min-h-screen w-full bg-[var(--bg)]">
        <AuthPortal mode={authMode} onClose={handleAuthClose} />
      </div>
    );
  }

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-[var(--bg)] px-6 py-10 text-[var(--text)]">
      <section className="w-full max-w-2xl">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-semibold tracking-tight">Welcome to Zyphora</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">Choose how you want to continue.</p>
        </div>

        {/* Choice cards */}
        <div className="grid gap-3 sm:grid-cols-3">
          <ChoiceCard
            icon={<UserRound size={18} />}
            title="Sign in"
            description="Access your account and synced settings."
            onClick={() => setAuthMode('signin')}
          />
          <ChoiceCard
            icon={<Cloud size={18} />}
            title="Create account"
            description="Set up an account for sync across devices."
            onClick={() => setAuthMode('signup')}
          />
          <ChoiceCard
            icon={<LockKeyhole size={18} />}
            title="Continue as guest"
            description="Browse locally without signing in."
            onClick={() => {
              chooseGuest();
              onContinue('guest');
            }}
          />
        </div>

        <p className="mt-5 text-sm leading-relaxed text-[var(--text-faint)]">
          Signing in syncs history, bookmarks, and settings across devices. Guest mode keeps
          everything on this machine.
        </p>
      </section>
    </main>
  );
};

function ChoiceCard({
  icon,
  title,
  description,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-start rounded-md border border-[var(--border-strong)] bg-[var(--surface)] p-4 text-left transition-colors hover:bg-[var(--hover)]"
    >
      <span className="mb-3 text-[var(--text-muted)]">{icon}</span>
      <span className="text-sm font-medium">{title}</span>
      <span className="mt-1 text-sm leading-relaxed text-[var(--text-muted)]">{description}</span>
    </button>
  );
}
