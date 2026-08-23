import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Search, Pencil } from 'lucide-react';
import { useSettingsStore } from '../stores/settingsStore';
import { takeImage, fetchNew } from '../lib/backgroundCache';
import type { PexelsImage } from '../../shared/types';

interface NewTabPageProps {
  onSearch: (url: string) => void;
}

export const NewTabPage: React.FC<NewTabPageProps> = ({ onSearch }) => {
  const newTabMode = useSettingsStore((s) => s.newTabMode);
  const backgroundCategory = useSettingsStore((s) => s.backgroundCategory);

  const [bg, setBg] = useState<PexelsImage | null>(null);
  const [bgVisible, setBgVisible] = useState(false);

  // Live clock (24-hour) + date, shown top-left
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const time = now.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const date = now.toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  // Centered search bar
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const searchEngine = useSettingsStore((s) => s.getSearchEngine());
  const engineIcon = (() => {
    try {
      const domain = new URL(searchEngine.url.replace(/%s/gi, '')).hostname;
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
    } catch {
      return null;
    }
  })();

  const handleSubmit = useCallback(() => {
    const raw = query.trim();
    if (!raw) return;
    onSearch(raw);
    setQuery('');
  }, [query, onSearch]);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    if (newTabMode !== 'full') {
      setBg(null);
      setBgVisible(false);
      return;
    }
    // Prefer a fully preloaded image from the cache → paints instantly.
    const cached = takeImage(backgroundCategory);
    if (cached) {
      setBgVisible(false);
      setBg(cached);
      return;
    }
    // Cache empty (e.g. first launch) — fetch one fresh in the background.
    let cancelled = false;
    fetchNew(backgroundCategory).then((img) => {
      if (!cancelled && img) {
        setBgVisible(false);
        setBg(img);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [newTabMode, backgroundCategory]);

  return (
    <div className="relative h-full w-full animate-[pageEnter_0.5s_ease-out_both] overflow-hidden bg-[var(--bg)]">
      {/* ── Time + date widget (top-left, both modes) ── */}
          <div className="absolute left-7 top-6 z-10 flex flex-col items-center">
            <div
              className="text-5xl font-bold tabular-nums text-[var(--text)]"
              style={{ textShadow: '0 2px 24px rgba(0,0,0,0.35)' }}
            >
              {time}
            </div>
            <div
              className="mt-1.5 text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]"
              style={{ textShadow: '0 1px 12px rgba(0,0,0,0.35)' }}
            >
              {date}
            </div>
          </div>

      {newTabMode === 'full' && (
        <>
          {/* ── Pexels background image (painted only after full load) ── */}
          {bg && (
            <img
              src={bg.url}
              alt=""
              aria-hidden="true"
              draggable={false}
              onLoad={() => setBgVisible(true)}
              onError={() => {
                setBg(null);
                setBgVisible(false);
              }}
              className="pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ease-out"
              style={{ opacity: bgVisible ? 1 : 0 }}
            />
          )}

          {/* ── Background attribution ── */}
          {bg && bgVisible && (
            <a
              href={bg.link}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => {
                e.preventDefault();
                if (bg.link) onSearch(bg.link);
              }}
              className="pointer-events-auto absolute bottom-4 left-4 z-20 max-w-[60%] truncate text-[10px] text-white/40 transition-colors duration-200 hover:text-white/70"
              title={`Photo by ${bg.photographer} on Pexels`}
            >
              Photo by {bg.photographer} · Pexels
            </a>
          )}
        </>
      )}

      {/* ── Centered white search bar + blue search button (both modes) ── */}
      <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 px-6">
        <div className="flex items-center gap-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
            className="flex w-80 items-center gap-3 rounded-full bg-white px-5 py-3.5 shadow-2xl transition-all duration-300 focus-within:w-[30rem]"
          >
            {focused &&
              (engineIcon ? (
                <img
                  src={engineIcon}
                  alt=""
                  className="h-4 w-4 shrink-0 rounded-sm"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <Search size={18} className="shrink-0 text-gray-400" />
              ))}
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="Search or enter URL"
              className="flex-1 bg-transparent text-[15px] text-gray-800 placeholder-gray-400 outline-none"
              spellCheck={false}
            />
          </form>

          <button
            type="button"
            aria-label="Search"
            onClick={() => handleSubmit()}
            className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-[var(--accent)] shadow-2xl transition-colors duration-200 hover:opacity-90"
          >
            <Search size={20} className="text-white" />
          </button>
        </div>
      </div>

      {/* ── Floating action button (bottom-right, both modes) ── */}
      <button
        type="button"
        aria-label="New tab"
        onClick={() => searchRef.current?.focus()}
        className="absolute bottom-6 right-6 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-800 shadow-2xl transition-all duration-200 hover:bg-gray-100 hover:scale-105 active:scale-95"
      >
        <Pencil size={20} />
      </button>
    </div>
  );
};
