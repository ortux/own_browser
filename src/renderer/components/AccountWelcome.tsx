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
    const account = useSettingsStore.getState().account;
    if (account) {
      onContinue(authMode ?? 'signin');
    } else {
      setAuthMode(null);
    }
  };

  if (authMode) {
    return (
      <div className="min-h-screen w-full bg-[var(--bg)]">
        <AuthPortal mode={authMode} onClose={handleAuthClose} />
      </div>
    );
  }

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-[var(--bg)] px-6 py-10 text-[var(--text)]">
      <section className="w-full max-w-[620px]">
        {/* Hero */}
        <div className="relative mb-12 text-center">
          {/* Decorative background glow */}
          <div className="absolute inset-0 -z-10 flex items-center justify-center">
            <div className="h-[280px] w-[280px] rounded-full bg-[var(--accent)]/5 blur-[100px]" />
          </div>

          {/* Logo mark */}
          <div className="mb-8 inline-flex h-20 w-20 items-center justify-center rounded-3xl border border-[var(--border)] bg-[var(--surface)] shadow-xl shadow-black/5">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <circle cx="20" cy="20" r="16" stroke="var(--accent)" strokeWidth="2.5" strokeDasharray="4 4" />
              <circle cx="20" cy="20" r="8" fill="var(--accent)" opacity="0.9" />
              <circle cx="20" cy="20" r="3" fill="var(--bg)" />
            </svg>
          </div>

          {/* Bold headline */}
          <h1 className="text-[42px] font-bold tracking-[-0.03em] leading-[1.1]">
            <span className="text-[var(--text)]">Browse with</span>
            <br />
            <span className="bg-gradient-to-r from-[var(--accent)] to-[var(--accent)]/60 bg-clip-text text-transparent">
              Zyphora
            </span>
          </h1>
          <p className="mt-5 text-[17px] text-[var(--text-muted)] leading-relaxed max-w-[440px] mx-auto">
            A private browser that syncs your way. History, bookmarks, and settings — always with you, never with us.
          </p>
        </div>

        {/* Choice cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          <ChoiceCard
            icon={<UserRound size={22} strokeWidth={1.5} />}
            title="Sign in"
            description="Access your synced profile."
            onClick={() => setAuthMode('signin')}
            gradient="from-blue-500/10 to-cyan-500/10"
            iconColor="text-blue-500"
          />
          <ChoiceCard
            icon={<Cloud size={22} strokeWidth={1.5} />}
            title="Create account"
            description="Sync across all devices."
            onClick={() => setAuthMode('signup')}
            gradient="from-violet-500/10 to-purple-500/10"
            iconColor="text-violet-500"
          />
          <ChoiceCard
            icon={<LockKeyhole size={22} strokeWidth={1.5} />}
            title="Guest mode"
            description="Browse locally only."
            onClick={() => {
              chooseGuest();
              onContinue('guest');
            }}
            gradient="from-amber-500/10 to-orange-500/10"
            iconColor="text-amber-500"
          />
        </div>

        {/* Trust indicators */}
        <div className="mt-12 flex items-center justify-center gap-6 text-[13px] text-[var(--text-faint)]">
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0110 0v4"/>
            </svg>
            End-to-end encrypted
          </div>
          <div className="h-3 w-px bg-[var(--border)]" />
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            No tracking
          </div>
          <div className="h-3 w-px bg-[var(--border)]" />
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Open source
          </div>
        </div>
      </section>
    </main>
  );
};

function ChoiceCard({
  icon,
  title,
  description,
  onClick,
  gradient,
  iconColor,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  gradient: string;
  iconColor: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex flex-col items-center rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center transition-all duration-300 hover:border-[var(--border-strong)] hover:shadow-xl hover:shadow-black/5 hover:-translate-y-1"
    >
      {/* Gradient background on hover */}
      <div className={`absolute inset-0 rounded-2xl bg-gradient-to-b ${gradient} opacity-0 transition-opacity duration-300 group-hover:opacity-100`} />

      <div className="relative mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--bg)] border border-[var(--border)] shadow-sm transition-all duration-300 group-hover:scale-110 group-hover:shadow-md">
        <span className={`transition-colors duration-300 ${iconColor}`}>{icon}</span>
      </div>
      <span className="relative text-[15px] font-semibold text-[var(--text)]">{title}</span>
      <span className="relative mt-1.5 text-[13px] leading-relaxed text-[var(--text-muted)]">{description}</span>
    </button>
  );
}
