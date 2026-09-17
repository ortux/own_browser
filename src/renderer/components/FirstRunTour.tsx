import React, { useMemo, useState } from 'react';
import { ArrowRight, Check, ChevronLeft, X } from 'lucide-react';
import { FIRST_RUN_TOUR_STEPS } from '../lib/firstRunTour';
import { useSettingsStore } from '../stores/settingsStore';

export const FirstRunTour: React.FC = () => {
  const [index, setIndex] = useState(0);
  const completeFirstRunTour = useSettingsStore((s) => s.completeFirstRunTour);

  const step = FIRST_RUN_TOUR_STEPS[index];
  const progress = useMemo(
    () => ((index + 1) / FIRST_RUN_TOUR_STEPS.length) * 100,
    [index]
  );

  const next = () => {
    if (index === FIRST_RUN_TOUR_STEPS.length - 1) {
      completeFirstRunTour();
      return;
    }
    setIndex((current) => current + 1);
  };

  const previous = () => {
    setIndex((current) => Math.max(0, current - 1));
  };

  const skip = () => {
    completeFirstRunTour();
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-50">
      <div
        className="absolute rounded-2xl border border-[var(--accent)] bg-[var(--surface)] shadow-2xl"
        style={{
          left: `${Math.max(0, step.target.x)}px`,
          top: `${Math.max(0, step.target.y)}px`,
          width: `${step.target.width ?? 220}px`,
          height: `${step.target.height ?? 120}px`,
          boxShadow: '0 20px 60px rgba(0,0,0,0.45)',
        }}
      >
        <div className="pointer-events-none absolute -inset-1 rounded-2xl border border-[var(--accent)]/60" />
      </div>

      <div className="pointer-events-auto absolute bottom-8 left-1/2 w-[min(430px,calc(100%-32px))] -translate-x-1/2 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--accent-fg)]">
            Quick tour
          </div>
          <button
            type="button"
            onClick={skip}
            className="rounded-full p-1.5 text-[var(--text-faint)] transition hover:bg-[var(--hover)] hover:text-[var(--text)]"
            aria-label="Skip tour"
          >
            <X size={15} />
          </button>
        </div>

        <div className="mb-3 h-2 overflow-hidden rounded-full bg-[var(--surface-3)]">
          <div
            className="h-full rounded-full bg-[var(--accent)] transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="mb-2 text-[18px] font-semibold text-[var(--text)]">{step.title}</div>
        <p className="text-[13px] leading-6 text-[var(--text-muted)]">{step.description}</p>

        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[12px] text-[var(--text)]">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent-fg)]">
              <ArrowRight size={14} />
            </span>
            <span>{step.pointerText}</span>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            onClick={previous}
            disabled={index === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[12px] text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft size={14} />
            Back
          </button>

          <button
            type="button"
            onClick={next}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-3 py-2 text-[12px] font-medium text-white"
          >
            {index === FIRST_RUN_TOUR_STEPS.length - 1 ? (
              <>
                Finish
                <Check size={14} />
              </>
            ) : (
              <>
                Next
                <ArrowRight size={14} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
