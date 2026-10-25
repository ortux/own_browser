/**
 * BookmarkImportScreen.tsx
 *
 * Onboarding step that lets the user import bookmarks from another browser.
 * Two paths are offered:
 *   1. Auto-detect – reads the default bookmark HTML file from Chrome, Edge,
 *      Firefox, or Brave and imports everything it finds.
 *   2. Manual file – a standard <input type="file"> that accepts any
 *      Netscape bookmark HTML file (the format all major browsers export).
 *
 * Parsing is done entirely in the renderer using the DOMParser so there is no
 * main-process round-trip for the actual HTML. Each parsed URL is then saved
 * via the existing bookmarks.add IPC call.
 */

import React, { useCallback, useRef, useState } from 'react';
import { BookmarkIcon, CheckCircle2, ChevronRight, FolderOpen, Loader2, SkipForward } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParsedBookmark {
  url: string;
  title: string;
}

interface BrowserOption {
  id: string;
  label: string;
  /** IPC channel the main process exposes to read the raw HTML, or null if
   *  not auto-detectable on this OS.  When null we fall through to manual. */
  ipcChannel: string | null;
  icon: string;
}

// ─── Browser candidates (auto-import) ────────────────────────────────────────

const BROWSERS: BrowserOption[] = [
  { id: 'chrome',  label: 'Google Chrome', ipcChannel: 'bookmarks:import:chrome',  icon: '🌐' },
  { id: 'edge',    label: 'Microsoft Edge', ipcChannel: 'bookmarks:import:edge',   icon: '🔵' },
  { id: 'firefox', label: 'Mozilla Firefox', ipcChannel: 'bookmarks:import:firefox', icon: '🦊' },
  { id: 'brave',   label: 'Brave',          ipcChannel: 'bookmarks:import:brave',   icon: '🦁' },
];

// ─── Netscape bookmark HTML parser ───────────────────────────────────────────

function parseBookmarkHtml(html: string): ParsedBookmark[] {
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const anchors = Array.from(doc.querySelectorAll<HTMLAnchorElement>('a[href]'));
    const results: ParsedBookmark[] = [];
    for (const a of anchors) {
      const url = a.getAttribute('href') ?? '';
      if (!url.startsWith('http://') && !url.startsWith('https://')) continue;
      results.push({ url, title: a.textContent?.trim() || url });
    }
    return results;
  } catch {
    return [];
  }
}

// ─── Bulk save ────────────────────────────────────────────────────────────────

async function saveBookmarks(
  bookmarks: ParsedBookmark[],
  onProgress: (done: number, total: number) => void
): Promise<number> {
  let saved = 0;
  for (let i = 0; i < bookmarks.length; i++) {
    const { url, title } = bookmarks[i];
    try {
      await window.browserAPI?.bookmarks.add(url, title);
      saved++;
    } catch {
      /* skip duplicates / invalid URLs */
    }
    onProgress(i + 1, bookmarks.length);
  }
  return saved;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface BookmarkImportScreenProps {
  onNext: () => void;
}

type Phase = 'pick' | 'importing' | 'done' | 'error';

export const BookmarkImportScreen: React.FC<BookmarkImportScreenProps> = ({ onNext }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase]         = useState<Phase>('pick');
  const [progress, setProgress]   = useState({ done: 0, total: 0 });
  const [savedCount, setSavedCount] = useState(0);
  const [errorMsg, setErrorMsg]   = useState('');

  // ── Run import from parsed bookmarks ─────────────────────────────────────

  const runImport = useCallback(async (bookmarks: ParsedBookmark[]) => {
    if (bookmarks.length === 0) {
      setErrorMsg('No bookmarks found in that file.');
      setPhase('error');
      return;
    }
    setProgress({ done: 0, total: bookmarks.length });
    setPhase('importing');
    const saved = await saveBookmarks(bookmarks, (done, total) =>
      setProgress({ done, total })
    );
    setSavedCount(saved);
    setPhase('done');
  }, []);

  // ── Auto-import from a known browser ─────────────────────────────────────

  const handleBrowserPick = useCallback(async (browser: BrowserOption) => {
    if (!browser.ipcChannel) {
      // Should not happen for listed browsers, but guard anyway
      fileInputRef.current?.click();
      return;
    }
    try {
      // Ask the main process to read the browser's bookmark file.
      // Returns the raw HTML string, or null if the file was not found.
      const html: string | null = await (window as any).browserAPI?.invoke?.(browser.ipcChannel);
      if (!html) {
        setErrorMsg(
          `Could not find ${browser.label}'s bookmarks on this device. ` +
          'Try importing a file manually instead.'
        );
        setPhase('error');
        return;
      }
      await runImport(parseBookmarkHtml(html));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Import failed.');
      setPhase('error');
    }
  }, [runImport]);

  // ── Manual file pick ──────────────────────────────────────────────────────

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const html = await file.text();
        await runImport(parseBookmarkHtml(html));
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Could not read the file.');
        setPhase('error');
      }
      // Reset so the same file can be re-selected if needed
      e.target.value = '';
    },
    [runImport]
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[var(--bg)] px-6">
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="mb-8 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-soft)]">
            <BookmarkIcon size={20} className="text-[var(--accent-fg)]" />
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-[var(--text)]">
              Import bookmarks
            </h1>
            <p className="text-sm text-[var(--text-muted)]">
              Bring your bookmarks from another browser — or skip for now.
            </p>
          </div>
        </div>

        {/* ── Phase: pick ─────────────────────────────────────────────── */}
        {phase === 'pick' && (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-faint)]">
              Detect automatically
            </p>

            {BROWSERS.map((browser) => (
              <button
                key={browser.id}
                type="button"
                onClick={() => void handleBrowserPick(browser)}
                className="flex w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-left transition-colors hover:bg-[var(--hover)]"
              >
                <span className="text-xl leading-none">{browser.icon}</span>
                <span className="flex-1 text-sm font-medium text-[var(--text)]">
                  {browser.label}
                </span>
                <ChevronRight size={15} className="text-[var(--text-faint)]" />
              </button>
            ))}

            <div className="relative my-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-[var(--border)]" />
              <span className="text-xs text-[var(--text-faint)]">or</span>
              <div className="h-px flex-1 bg-[var(--border)]" />
            </div>

            <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-faint)]">
              Import from file
            </p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full items-center gap-3 rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface)] px-4 py-4 text-left transition-colors hover:bg-[var(--hover)]"
            >
              <FolderOpen size={18} className="shrink-0 text-[var(--text-muted)]" />
              <div>
                <p className="text-sm font-medium text-[var(--text)]">Choose a bookmark file</p>
                <p className="text-xs text-[var(--text-faint)]">
                  Netscape HTML format (.html) — exported by Chrome, Firefox, Safari, Edge
                </p>
              </div>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".html,.htm"
              className="hidden"
              onChange={handleFileChange}
            />

            <button
              type="button"
              onClick={onNext}
              className="mt-2 flex w-full items-center justify-center gap-2 py-2 text-sm text-[var(--text-faint)] transition-colors hover:text-[var(--text)]"
            >
              <SkipForward size={14} />
              Skip for now
            </button>
          </div>
        )}

        {/* ── Phase: importing ────────────────────────────────────────── */}
        {phase === 'importing' && (
          <div className="flex flex-col items-center gap-5 py-10">
            <Loader2 size={36} className="animate-spin text-[var(--accent)]" />
            <div className="text-center">
              <p className="text-sm font-medium text-[var(--text)]">Importing bookmarks…</p>
              <p className="mt-1 text-xs text-[var(--text-faint)]">
                {progress.done} of {progress.total}
              </p>
            </div>
            {/* Progress bar */}
            <div className="h-1.5 w-64 overflow-hidden rounded-full bg-[var(--surface-2)]">
              <div
                className="h-full rounded-full bg-[var(--accent)] transition-all duration-150"
                style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {/* ── Phase: done ─────────────────────────────────────────────── */}
        {phase === 'done' && (
          <div className="flex flex-col items-center gap-5 py-8">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500/15">
              <CheckCircle2 size={32} className="text-green-400" />
            </span>
            <div className="text-center">
              <p className="text-lg font-semibold text-[var(--text)]">
                {savedCount} bookmark{savedCount !== 1 ? 's' : ''} imported
              </p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                You can manage them any time from the bookmarks panel.
              </p>
            </div>
            <button
              type="button"
              onClick={onNext}
              className="mt-2 rounded-lg bg-[var(--accent)] px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-hover)]"
            >
              Continue
            </button>
          </div>
        )}

        {/* ── Phase: error ─────────────────────────────────────────────── */}
        {phase === 'error' && (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <p className="text-sm text-[var(--danger)]">{errorMsg}</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setPhase('pick'); setErrorMsg(''); }}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm text-[var(--text)] transition-colors hover:bg-[var(--hover)]"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={onNext}
                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-hover)]"
              >
                Skip
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
