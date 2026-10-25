import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, ChevronLeft, X } from 'lucide-react';
import { FIRST_RUN_TOUR_STEPS, type FirstRunTourStep } from '../lib/firstRunTour';
import { useSettingsStore } from '../stores/settingsStore';

// ─── Types ────────────────────────────────────────────────────────────────────

type Rect = { top: number; left: number; width: number; height: number };

type CardPlacement = 'top' | 'bottom' | 'left' | 'right';

/** Dimensions of the floating info card. */
const CARD_W = 430;
const CARD_H_APPROX = 220; // conservative estimate used for placement math
const CARD_MARGIN = 16;    // minimum gap between card edge and viewport edge
const CARD_OFFSET = 12;    // gap between highlight box and card

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Measure the bounding rect of the element matched by `selector`, or null. */
function measureTarget(selector: string, padding: number): Rect | null {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {
    top: r.top - padding,
    left: r.left - padding,
    width: r.width + padding * 2,
    height: r.height + padding * 2,
  };
}

/**
 * Decide where the card should appear relative to the highlight box.
 * Returns the resolved placement and the card's {top, left} CSS position.
 */
function resolveCardPosition(
  rect: Rect,
  step: FirstRunTourStep,
  vw: number,
  vh: number,
): { placement: CardPlacement; top: number; left: number } {
  const cardW = Math.min(CARD_W, vw - CARD_MARGIN * 2);

  // Space available on each side of the highlight box
  const spaceTop = rect.top - CARD_OFFSET;
  const spaceBottom = vh - (rect.top + rect.height) - CARD_OFFSET;
  const spaceLeft = rect.left - CARD_OFFSET;
  const spaceRight = vw - (rect.left + rect.width) - CARD_OFFSET;

  // Candidate placements in preference order
  const candidates: CardPlacement[] =
    step.cardPlacement && step.cardPlacement !== 'auto'
      ? [step.cardPlacement, 'bottom', 'top', 'right', 'left']
      : ['bottom', 'top', 'right', 'left'];

  const fits: Record<CardPlacement, boolean> = {
    top: spaceTop >= CARD_H_APPROX,
    bottom: spaceBottom >= CARD_H_APPROX,
    left: spaceLeft >= cardW,
    right: spaceRight >= cardW,
  };

  const placement = candidates.find((p) => fits[p]) ?? 'bottom';

  // Centre the card along the cross-axis, clamped inside the viewport
  const clampX = (x: number) => Math.max(CARD_MARGIN, Math.min(vw - cardW - CARD_MARGIN, x));
  const clampY = (y: number) => Math.max(CARD_MARGIN, Math.min(vh - CARD_H_APPROX - CARD_MARGIN, y));
  const centreX = clampX(rect.left + rect.width / 2 - cardW / 2);
  const centreY = clampY(rect.top + rect.height / 2 - CARD_H_APPROX / 2);

  switch (placement) {
    case 'top':
      return { placement, top: clampY(rect.top - CARD_OFFSET - CARD_H_APPROX), left: centreX };
    case 'bottom':
      return { placement, top: clampY(rect.top + rect.height + CARD_OFFSET), left: centreX };
    case 'left':
      return { placement, top: centreY, left: clampX(rect.left - CARD_OFFSET - cardW) };
    case 'right':
      return { placement, top: centreY, left: clampX(rect.left + rect.width + CARD_OFFSET) };
  }
}

// ─── Spotlight overlay ────────────────────────────────────────────────────────

/**
 * Renders an SVG cutout that dims the whole viewport except the highlighted
 * region, giving a smooth "spotlight" effect without blocking pointer events
 * on the real element.
 */
const Spotlight: React.FC<{ rect: Rect; radius?: number }> = ({ rect, radius = 10 }) => {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <mask id="tour-spotlight-mask">
          {/* White = visible (dimmed overlay shows through) */}
          <rect width="100%" height="100%" fill="white" />
          {/* Black = cutout (spotlight: overlay hidden here) */}
          <rect
            x={rect.left}
            y={rect.top}
            width={rect.width}
            height={rect.height}
            rx={radius}
            ry={radius}
            fill="black"
          />
        </mask>
      </defs>
      {/* Semi-transparent overlay with the cutout applied */}
      <rect
        width="100%"
        height="100%"
        fill="rgba(0,0,0,0.45)"
        mask="url(#tour-spotlight-mask)"
      />
      {/* Accent border around the cutout */}
      <rect
        x={rect.left}
        y={rect.top}
        width={rect.width}
        height={rect.height}
        rx={radius}
        ry={radius}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2"
        opacity="0.85"
      />
    </svg>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

export const FirstRunTour: React.FC = () => {
  const [index, setIndex] = useState(0);
  const completeFirstRunTour = useSettingsStore((s) => s.completeFirstRunTour);

  // Live-measured rect of the current step's target element
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  // Viewport dimensions, kept in sync via ResizeObserver
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight });

  const rafRef = useRef<number | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);

  const step: FirstRunTourStep = FIRST_RUN_TOUR_STEPS[index];
  const padding = step.padding ?? 6;

  // ── Measure the target element ─────────────────────────────────────────────

  const measure = useCallback(() => {
    const rect = measureTarget(step.selector, padding);
    setTargetRect(rect);
  }, [step.selector, padding]);

  /** Re-measure on every animation frame while the tour is visible so the
   *  highlight tracks the element even if it shifts (e.g. sidebar expansion). */
  const startRaf = useCallback(() => {
    const loop = () => {
      measure();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [measure]);

  const stopRaf = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  // Start/restart the RAF loop whenever the step changes
  useLayoutEffect(() => {
    stopRaf();
    startRaf();
    return stopRaf;
  }, [startRaf, stopRaf]);

  // Track viewport resizes
  useEffect(() => {
    roRef.current = new ResizeObserver(() => {
      setViewport({ w: window.innerWidth, h: window.innerHeight });
    });
    roRef.current.observe(document.documentElement);
    return () => roRef.current?.disconnect();
  }, []);

  // ── Navigation ─────────────────────────────────────────────────────────────

  const next = () => {
    if (index === FIRST_RUN_TOUR_STEPS.length - 1) {
      completeFirstRunTour();
    } else {
      setIndex((i) => i + 1);
    }
  };

  const previous = () => setIndex((i) => Math.max(0, i - 1));
  const skip = () => completeFirstRunTour();

  // ── Layout math ────────────────────────────────────────────────────────────

  const progress = useMemo(
    () => ((index + 1) / FIRST_RUN_TOUR_STEPS.length) * 100,
    [index],
  );

  const cardPosition = useMemo(() => {
    if (!targetRect) return null;
    return resolveCardPosition(targetRect, step, viewport.w, viewport.h);
  }, [targetRect, step, viewport]);

  const cardW = Math.min(CARD_W, viewport.w - CARD_MARGIN * 2);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="pointer-events-none absolute inset-0 z-50">
      {/* Dimmed overlay with spotlight cutout */}
      {targetRect && <Spotlight rect={targetRect} />}

      {/* Fallback pulsing border when element not yet found */}
      {!targetRect && (
        <div className="absolute inset-0 pointer-events-none" />
      )}

      {/* Floating info card */}
      <div
        className="pointer-events-auto absolute rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 shadow-2xl"
        style={{
          width: cardW,
          top: cardPosition?.top ?? viewport.h - 8 - CARD_H_APPROX,
          left: cardPosition?.left ?? Math.max(CARD_MARGIN, viewport.w / 2 - cardW / 2),
          // Smooth card movement between steps
          transition: 'top 220ms cubic-bezier(0.4,0,0.2,1), left 220ms cubic-bezier(0.4,0,0.2,1)',
        }}
        role="dialog"
        aria-modal="false"
        aria-label={`Tour step ${index + 1} of ${FIRST_RUN_TOUR_STEPS.length}: ${step.title}`}
      >
        {/* Header row */}
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--accent-fg)]">
            Quick tour
            <span className="text-[var(--text-faint)] font-normal normal-case tracking-normal">
              {index + 1} / {FIRST_RUN_TOUR_STEPS.length}
            </span>
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

        {/* Progress bar */}
        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-[var(--surface-3)]">
          <div
            className="h-full rounded-full bg-[var(--accent)] transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Step content */}
        <div className="mb-2 text-[18px] font-semibold text-[var(--text)]">{step.title}</div>
        <p className="text-[13px] leading-6 text-[var(--text-muted)]">{step.description}</p>

        {/* Pointer hint */}
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[12px] text-[var(--text)]">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent-fg)]">
            <ArrowRight size={14} />
          </span>
          <span>{step.pointerText}</span>
        </div>

        {/* Navigation buttons */}
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
