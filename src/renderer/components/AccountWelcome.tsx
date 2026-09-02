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
      <div className="min-h-screen w-full bg-[#090a0b]">
        <AuthPortal mode={authMode} onClose={handleAuthClose} />
      </div>
    );
  }

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-[var(--bg)] px-6 py-10 text-[var(--text)]">
      <section className="w-full max-w-4xl rounded-[28px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-2xl shadow-black/10 md:p-8">

        {/* Header */}
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent)] text-white shadow-lg shadow-blue-500/20">
            <Cloud size={22} />
          </div>
          <div>
            <p className="text-lg font-semibold tracking-tight">Welcome to Zyphora</p>
            <p className="text-sm text-[var(--text-faint)]">Choose how you want to continue</p>
          </div>
        </div>

        {/* Choice cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <ChoiceCard
            icon={<UserRound size={21} />}
            title="Sign in"
            description="Access your account and synced settings."
            onClick={() => setAuthMode('signin')}
          />
          <ChoiceCard
            icon={<Cloud size={21} />}
            title="Create account"
            description="Set up an account for sync across devices."
            onClick={() => setAuthMode('signup')}
          />
          <ChoiceCard
            icon={<LockKeyhole size={21} />}
            title="Continue as guest"
            description="Browse locally without signing in."
            onClick={() => { chooseGuest(); onContinue('guest'); }}
          />
        </div>

        <p className="mt-8 max-w-2xl text-xs leading-relaxed text-[var(--text-faint)]">
          Sign in to sync your history, bookmarks, and settings across devices.
          Guest mode stays local to this machine.
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
      className="group flex min-h-48 flex-col items-start rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--accent)] hover:shadow-lg hover:shadow-blue-500/10"
    >
      <span className="mb-7 flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--surface-2)] text-[var(--accent)] transition-colors group-hover:bg-[var(--accent)] group-hover:text-white">
        {icon}
      </span>
      <span className="text-base font-semibold">{title}</span>
      <span className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">{description}</span>
    </button>
  );
}
