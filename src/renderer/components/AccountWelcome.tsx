import React, { useState } from 'react';
import { Check, Cloud, LockKeyhole, UserRound } from 'lucide-react';

interface AccountWelcomeProps {
  onContinue: (choice: 'signin' | 'signup' | 'guest') => void;
}

export const AccountWelcome: React.FC<AccountWelcomeProps> = ({ onContinue }) => {
  const [selected, setSelected] = useState<'signin' | 'signup' | 'guest' | null>(null);

  const choose = (choice: 'signin' | 'signup' | 'guest') => {
    setSelected(choice);
    onContinue(choice);
  };

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-[var(--bg)] px-6 py-10 text-[var(--text)]">
      <section className="w-full max-w-3xl">
        <div className="mb-10 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent)] text-white shadow-lg shadow-blue-500/20">
            <Cloud size={22} />
          </div>
          <div>
            <p className="text-lg font-semibold tracking-tight">Welcome to Zyphora</p>
            <p className="text-sm text-[var(--text-faint)]">Choose how you want to continue</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <ChoiceCard
            icon={<UserRound size={21} />}
            title="Sign in"
            description="Access your account and synced settings."
            onClick={() => choose('signin')}
            selected={selected === 'signin'}
          />
          <ChoiceCard
            icon={<Cloud size={21} />}
            title="Create account"
            description="Set up an account for sync across devices."
            onClick={() => choose('signup')}
            selected={selected === 'signup'}
          />
          <ChoiceCard
            icon={<LockKeyhole size={21} />}
            title="Continue as guest"
            description="Browse locally without signing in."
            onClick={() => choose('guest')}
            selected={selected === 'guest'}
          />
        </div>

        <p className="mt-8 max-w-2xl text-xs leading-relaxed text-[var(--text-faint)]">
          You can change this choice later. Guest browsing keeps your settings on this device;
          account sign-in and sync will be available when account services are connected.
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
  selected,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  selected: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex min-h-48 flex-col items-start rounded-2xl border p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--accent)] hover:shadow-lg hover:shadow-blue-500/10 ${
        selected
          ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
          : 'border-[var(--border)] bg-[var(--surface)]'
      }`}
    >
      <span className={`mb-7 flex h-10 w-10 items-center justify-center rounded-xl ${selected ? 'bg-[var(--accent)] text-white' : 'bg-[var(--surface-2)] text-[var(--accent)]'}`}>
        {selected ? <Check size={20} /> : icon}
      </span>
      <span className="text-base font-semibold">{title}</span>
      <span className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">{description}</span>
    </button>
  );
}
