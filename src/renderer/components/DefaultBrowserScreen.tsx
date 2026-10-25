/**
 * DefaultBrowserScreen.tsx
 *
 * Onboarding step that offers to make Zyphora the default browser.
 * Uses the existing window.browserAPI.general.isDefaultBrowser /
 * makeDefaultBrowser IPC calls that are already wired in generalSettings.ts.
 *
 * The user can accept, decline, or skip — all paths advance onboarding.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Globe, Loader2, SkipForward } from 'lucide-react';

interface DefaultBrowserScreenProps {
  onNext: () => void;
}

type Phase = 'checking' | 'already-default' | 'prompt' | 'setting' | 'set-ok' | 'set-failed';

export const DefaultBrowserScreen: React.FC<DefaultBrowserScreenProps> = ({ onNext }) => {
  const [phase, setPhase]       = useState<Phase>('checking');
  const [statusMsg, setStatusMsg] = useState('');

  // ── Check current state on mount ─────────────────────────────────────────

  useEffect(() => {
    void window.browserAPI?.general
      .isDefaultBrowser()
      .then((isDefault) => setPhase(isDefault ? 'already-default' : 'prompt'))
      .catch(() => setPhase('prompt'));
  }, []);

  // ── Ask the OS to make us default ─────────────────────────────────────────

  const handleMakeDefault = useCallback(async () => {
    setPhase('setting');
    setStatusMsg('');
    try {
      const ok = await window.browserAPI?.general.makeDefaultBrowser();
      if (ok) {
        setPhase('set-ok');
      } else {
        setStatusMsg(
          'Your system did not accept the change automatically. ' +
          'Open your operating-system settings and choose Zyphora as the default browser there.'
        );
        setPhase('set-failed');
      }
    } catch {
      setStatusMsg('Could not reach the operating system to make the change.');
      setPhase('set-failed');
    }
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[var(--bg)] px-6">
      <div className="w-full max-w-sm text-center">

        {/* ── Checking ──────────────────────────────────────────────────── */}
        {phase === 'checking' && (
          <Loader2 size={32} className="mx-auto animate-spin text-[var(--accent)]" />
        )}

        {/* ── Already default ───────────────────────────────────────────── */}
        {phase === 'already-default' && (
          <div className="flex flex-col items-center gap-5">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500/15">
              <CheckCircle2 size={32} className="text-green-400" />
            </span>
            <div>
              <h1 className="text-xl font-semibold text-[var(--text)]">
                Zyphora is already your default browser
              </h1>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                Links from other apps will open here automatically.
              </p>
            </div>
            <button
              type="button"
              onClick={onNext}
              className="rounded-lg bg-[var(--accent)] px-8 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-hover)]"
            >
              Continue
            </button>
          </div>
        )}

        {/* ── Prompt ────────────────────────────────────────────────────── */}
        {phase === 'prompt' && (
          <div className="flex flex-col items-center gap-6">
            <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-[var(--accent-soft)]">
              <Globe size={28} className="text-[var(--accent-fg)]" />
            </span>
            <div>
              <h1 className="text-xl font-semibold text-[var(--text)]">
                Make Zyphora your default browser
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                Links you click in emails, documents, and other apps will open
                in Zyphora. You can change this later in Settings → General.
              </p>
            </div>
            <div className="flex w-full flex-col gap-2">
              <button
                type="button"
                onClick={() => void handleMakeDefault()}
                className="w-full rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-hover)]"
              >
                Set as default browser
              </button>
              <button
                type="button"
                onClick={onNext}
                className="flex w-full items-center justify-center gap-2 py-2 text-sm text-[var(--text-faint)] transition-colors hover:text-[var(--text)]"
              >
                <SkipForward size={14} />
                Not now
              </button>
            </div>
          </div>
        )}

        {/* ── Setting (spinner) ─────────────────────────────────────────── */}
        {phase === 'setting' && (
          <div className="flex flex-col items-center gap-4">
            <Loader2 size={32} className="animate-spin text-[var(--accent)]" />
            <p className="text-sm text-[var(--text-muted)]">Updating system settings…</p>
          </div>
        )}

        {/* ── Set OK ────────────────────────────────────────────────────── */}
        {phase === 'set-ok' && (
          <div className="flex flex-col items-center gap-5">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500/15">
              <CheckCircle2 size={32} className="text-green-400" />
            </span>
            <div>
              <h1 className="text-xl font-semibold text-[var(--text)]">Done!</h1>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                Zyphora is now your default browser.
              </p>
            </div>
            <button
              type="button"
              onClick={onNext}
              className="rounded-lg bg-[var(--accent)] px-8 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-hover)]"
            >
              Continue
            </button>
          </div>
        )}

        {/* ── Set failed ────────────────────────────────────────────────── */}
        {phase === 'set-failed' && (
          <div className="flex flex-col items-center gap-5">
            <Globe size={32} className="text-[var(--text-faint)]" />
            <div>
              <h1 className="text-xl font-semibold text-[var(--text)]">
                Manual step needed
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                {statusMsg}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => void handleMakeDefault()}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm text-[var(--text)] transition-colors hover:bg-[var(--hover)]"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={onNext}
                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-hover)]"
              >
                Continue anyway
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
