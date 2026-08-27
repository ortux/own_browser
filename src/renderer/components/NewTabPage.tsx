import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Search, Pencil, Plus, X } from 'lucide-react';
import { useSettingsStore } from '../stores/settingsStore';
import { takeImage, fetchNew } from '../lib/backgroundCache';
import type { PexelsImage, HistoryEntry } from '../../shared/types';
import appIcon from '../../../public/icon.png';

interface NewTabPageProps {
  onSearch: (url: string) => void;
}

// ── Quotes ────────────────────────────────────────────────────────────────────
const QUOTES = [
  { text: 'The only way to do great work is to love what you do.', author: 'Steve Jobs' },
  { text: 'In the middle of difficulty lies opportunity.', author: 'Albert Einstein' },
  { text: 'It does not matter how slowly you go as long as you do not stop.', author: 'Confucius' },
  { text: "Life is what happens when you're busy making other plans.", author: 'John Lennon' },
  { text: 'The future belongs to those who believe in the beauty of their dreams.', author: 'Eleanor Roosevelt' },
  { text: 'Strive not to be a success, but rather to be of value.', author: 'Albert Einstein' },
  { text: "You miss 100% of the shots you don't take.", author: 'Wayne Gretzky' },
  { text: "Whether you think you can or you think you can't, you're right.", author: 'Henry Ford' },
  { text: 'The mind is everything. What you think you become.', author: 'Buddha' },
  { text: 'An unexamined life is not worth living.', author: 'Socrates' },
  { text: 'Spread love everywhere you go.', author: 'Mother Teresa' },
  { text: 'Always remember that you are absolutely unique.', author: 'Margaret Mead' },
  { text: 'Do not go where the path may lead — go instead where there is no path.', author: 'Ralph Waldo Emerson' },
  { text: 'The greatest glory in living lies not in never falling, but in rising every time we fall.', author: 'Nelson Mandela' },
  { text: 'Never let the fear of striking out keep you from playing the game.', author: 'Babe Ruth' },
  { text: 'Life is either a daring adventure or nothing at all.', author: 'Helen Keller' },
  { text: 'Many of life\'s failures are people who did not realize how close they were to success.', author: 'Thomas Edison' },
  { text: 'It always seems impossible until it is done.', author: 'Nelson Mandela' },
  { text: 'Do what you can, with what you have, where you are.', author: 'Theodore Roosevelt' },
  { text: 'If you look at what you have in life, you\'ll always have more.', author: 'Oprah Winfrey' },
];

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 5)  return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Good night';
}

function getDailyQuote() {
  const day = Math.floor(Date.now() / 86_400_000);
  return QUOTES[day % QUOTES.length];
}

// A softer frosted-glass layer that dissolves at its edges (mask fades to
// transparent) so the panel blends into the background instead of sitting on it.
function glassLayer(opacity: number, blur: number): React.CSSProperties {
  return {
    background: `rgba(0,0,0,${opacity})`,
    backdropFilter: `blur(${blur}px) saturate(120%)`,
    WebkitBackdropFilter: `blur(${blur}px) saturate(120%)`,
    WebkitMaskImage: 'radial-gradient(135% 135% at 50% 50%, #000 50%, transparent 100%)',
    maskImage: 'radial-gradient(135% 135% at 50% 50%, #000 50%, transparent 100%)',
  };
}

// ── Component ─────────────────────────────────────────────────────────────────
export const NewTabPage: React.FC<NewTabPageProps> = ({ onSearch }) => {
  const newTabMode        = useSettingsStore((s) => s.newTabMode);
  const backgroundCategory = useSettingsStore((s) => s.backgroundCategory);
  const account           = useSettingsStore((s) => s.account);
  const quickLinks        = useSettingsStore((s) => s.quickLinks);
  const addQuickLink      = useSettingsStore((s) => s.addQuickLink);
  const removeQuickLink   = useSettingsStore((s) => s.removeQuickLink);

  const [bg, setBg]           = useState<PexelsImage | null>(null);
  const [bgVisible, setBgVisible] = useState(false);

  // ── Quick links: user shortcuts + most-visited sites from history ──
  const [topSites, setTopSites] = useState<{ url: string; title: string }[]>([]);
  const [showAddLink, setShowAddLink] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [linkError, setLinkError] = useState('');

  useEffect(() => {
    window.browserAPI.history.get(200).then((entries: HistoryEntry[]) => {
      const counts = new Map<string, { count: number; title: string; url: string }>();
      for (const entry of entries) {
        try {
          const parsed = new URL(entry.url);
          if (!/^https?:$/.test(parsed.protocol)) continue;
          const host = parsed.hostname.replace(/^www\./, '');
          const existing = counts.get(host);
          if (existing) existing.count += 1;
          else counts.set(host, { count: 1, title: entry.title || host, url: `${parsed.protocol}//${host}` });
        } catch { /* skip */ }
      }
      const quickUrls = new Set(quickLinks.map((link) => link.url));
      setTopSites(
        [...counts.values()]
          .sort((a, b) => b.count - a.count)
          .filter((site) => !quickUrls.has(site.url))
          .slice(0, 4)
          .map((site) => ({ url: site.url, title: site.title })),
      );
    }).catch(() => {});
    // quickLinks changes are reflected through the quickUrls filter above only
    // on reload; acceptable for a v1 shortcut grid.
  }, []);

  const submitQuickLink = () => {
    if (addQuickLink(linkUrl, linkTitle)) {
      setLinkUrl(''); setLinkTitle(''); setLinkError(''); setShowAddLink(false);
    } else {
      setLinkError('Enter a valid http(s) URL.');
    }
  };

  // ── Clock ──
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const date = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

  // ── Greeting + rotating quote ──
  const greeting = getGreeting();
  const [quote, setQuote]         = useState(getDailyQuote);
  const [quoteVisible, setQuoteVisible] = useState(true);
  const quoteTransition = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const cycle = setInterval(() => {
      setQuoteVisible(false);
      quoteTransition.current = setTimeout(() => {
        setQuote((prev) => {
          const idx = QUOTES.indexOf(prev);
          return QUOTES[(idx + 1) % QUOTES.length];
        });
        setQuoteVisible(true);
        quoteTransition.current = null;
      }, 400);
    }, 30_000);
    return () => {
      clearInterval(cycle);
      if (quoteTransition.current) clearTimeout(quoteTransition.current);
    };
  }, []);

  // ── Search bar ──
  const [query, setQuery]   = useState('');
  const [focused, setFocused] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const searchEngine = useSettingsStore((s) => s.getSearchEngine());
  // Local letter avatar — no remote favicon request for a privacy browser.
  const engineInitial = searchEngine.name.trim().charAt(0).toUpperCase() || '?';

  const handleSubmit = useCallback(() => {
    const raw = query.trim();
    if (!raw) return;
    onSearch(raw);
    setQuery('');
  }, [query, onSearch]);

  useEffect(() => { searchRef.current?.focus(); }, []);

  // ── Background ──
  useEffect(() => {
    if (newTabMode !== 'full') { setBg(null); setBgVisible(false); return; }
    const cached = takeImage(backgroundCategory);
    if (cached) { setBgVisible(false); setBg(cached); return; }
    let cancelled = false;
    fetchNew(backgroundCategory).then((img) => {
      if (!cancelled && img) { setBgVisible(false); setBg(img); }
    });
    return () => { cancelled = true; };
  }, [newTabMode, backgroundCategory]);

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="relative h-full w-full animate-[pageEnter_0.5s_ease-out_both] overflow-hidden bg-[var(--bg)]">

      {/* Zyphora brand lockup — top-left */}
      <div
        className="absolute left-7 top-6 z-10 px-3 py-2 rounded-xl"
      >
        {newTabMode === 'full' && (
          <div className="absolute inset-0 rounded-xl" style={glassLayer(0.14, 5)} />
        )}
        <div className="relative flex flex-col items-center gap-1">
          <div className="flex items-center gap-2.5">
            <img
              src={appIcon}
              alt="Zyphora"
              width={26}
              height={26}
              className="shrink-0 rounded drop-shadow-lg"
              draggable={false}
            />
            <span
              className="text-3xl font-semibold"
              style={{
                fontFamily: '"Poppins", sans-serif',
                letterSpacing: '0.08em',
                color: newTabMode === 'full' ? '#fff' : 'var(--text)',
                textShadow: newTabMode === 'full' ? '0 2px 12px rgba(0,0,0,0.8)' : '0 2px 20px rgba(0,0,0,0.2)',
              }}
            >
              Zyphora
            </span>
          </div>
          <p
            className="text-[10px] uppercase tracking-[0.2em] pl-0.5"
            style={{ color: newTabMode === 'full' ? 'rgba(255,255,255,0.5)' : 'var(--text-faint)' }}
          >
            Browse with clarity
          </p>
        </div>
      </div>

      {/* Clock — top-right */}
      <div
        className="absolute right-7 top-6 z-10 px-3 py-2 rounded-xl"
      >
        {newTabMode === 'full' && (
          <div className="absolute inset-0 rounded-xl" style={glassLayer(0.14, 5)} />
        )}
        <div className="relative flex flex-col items-center">
          <div
            className="text-5xl font-bold tabular-nums"
            style={{
              color: newTabMode === 'full' ? '#fff' : 'var(--text)',
              textShadow: newTabMode === 'full' ? '0 2px 16px rgba(0,0,0,0.8)' : 'none',
            }}
          >
            {time}
          </div>
          <div
            className="mt-1.5 text-xs uppercase tracking-[0.18em]"
            style={{ color: newTabMode === 'full' ? 'rgba(255,255,255,0.6)' : 'var(--text-muted)' }}
          >
            {date}
          </div>
        </div>
      </div>

      {/* Background image (full mode) */}
      {newTabMode === 'full' && (
        <>
          {bg && (
            <img
              src={bg.url} alt="" aria-hidden="true" draggable={false}
              onLoad={() => setBgVisible(true)}
              onError={() => { setBg(null); setBgVisible(false); }}
              className="pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ease-out"
              style={{ opacity: bgVisible ? 1 : 0 }}
            />
          )}
          {/* Dark overlay so text is always readable */}
          {bg && bgVisible && (
            <div className="absolute inset-0 pointer-events-none"
              style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.15) 50%, rgba(0,0,0,0.45) 100%)' }}
            />
          )}
          {bg && bgVisible && (
            <a
              href={bg.link} target="_blank" rel="noreferrer"
              onClick={(e) => { e.preventDefault(); if (bg.link) onSearch(bg.link); }}
              className="pointer-events-auto absolute bottom-4 left-4 z-20 max-w-[60%] truncate text-[10px] text-white/40 transition-colors duration-200 hover:text-white/70"
              title={`Photo by ${bg.photographer} on Pexels`}
            >
              Photo by {bg.photographer} · Pexels
            </a>
          )}
        </>
      )}

      {/* Centre column: greeting + quote + search */}
      <div
        className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 px-8 py-8 w-full max-w-2xl rounded-2xl"
      >
        {newTabMode === 'full' && (
          <div className="absolute inset-0 rounded-2xl" style={glassLayer(0.18, 7)} />
        )}
        <div className="relative flex flex-col items-center gap-5">

        {/* Greeting */}
        <h1
          className="text-5xl font-semibold tracking-tight"
          style={{
            fontFamily: '"Poppins", sans-serif',
            color: newTabMode === 'full' ? '#fff' : 'var(--text)',
            textShadow: newTabMode === 'full' ? '0 2px 16px rgba(0,0,0,0.8)' : 'none',
          }}
        >
          {greeting}, {account?.name ?? 'Guest'}
        </h1>

        {/* Quote — fades in/out every 30 s */}
        <div
          className="text-center max-w-lg transition-opacity duration-[400ms] ease-in-out"
          style={{ opacity: quoteVisible ? 1 : 0 }}
        >
          <p
            className="text-sm italic leading-relaxed"
            style={{
              color: newTabMode === 'full' ? 'rgba(255,255,255,0.8)' : 'var(--text-muted)',
              textShadow: newTabMode === 'full' ? '0 1px 8px rgba(0,0,0,0.9)' : 'none',
            }}
          >
            "{quote.text}"
          </p>
          <p
            className="mt-1.5 text-xs"
            style={{ color: newTabMode === 'full' ? 'rgba(255,255,255,0.5)' : 'var(--text-faint)' }}
          >
            — {quote.author}
          </p>
        </div>

        {/* Search bar + button */}
        <div className="flex items-center gap-3 w-full justify-center mt-1">
          <form
            onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}
            className="flex items-center gap-3 rounded-full bg-white px-5 py-3.5 shadow-2xl transition-all duration-300 w-80 focus-within:w-full"
          >
            {focused && (
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm bg-gray-200 text-[10px] font-semibold text-gray-600">
                {engineInitial}
              </span>
            )}
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
            type="button" aria-label="Search" onClick={handleSubmit}
            className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-[var(--accent)] shadow-2xl transition-colors duration-200 hover:opacity-90"
          >
            <Search size={20} className="text-white" />
          </button>
        </div>

        {/* Quick links — pinned shortcuts + most-visited sites */}
        <div className="mt-6 flex max-w-2xl flex-wrap items-center justify-center gap-3">
          {quickLinks.map((link) => (
            <div key={link.url} className="group relative">
              <button
                type="button"
                onClick={() => onSearch(link.url)}
                title={link.url}
                className="flex h-16 w-16 flex-col items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-black/30 backdrop-blur-md transition-all hover:scale-105 hover:border-white/25"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent)]/90 text-[11px] font-semibold text-white">
                  {(link.title || link.url).replace(/^https?:\/\/(www\.)?/, '').charAt(0).toUpperCase()}
                </span>
                <span className="w-14 truncate text-[10px] text-white/80">{link.title}</span>
              </button>
              <button
                type="button"
                onClick={() => removeQuickLink(link.url)}
                className="absolute -right-1 -top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--text-muted)] shadow group-hover:flex hover:text-red-400"
                title="Remove shortcut"
                aria-label={`Remove ${link.title}`}
              >
                <X size={11} />
              </button>
            </div>
          ))}

          {topSites.map((site) => (
            <button
              key={site.url}
              type="button"
              onClick={() => onSearch(site.url)}
              title={site.title}
              className="flex h-16 w-16 flex-col items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-black/30 backdrop-blur-md transition-all hover:scale-105 hover:border-white/25"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 text-[11px] font-semibold text-white">
                {site.title.replace(/^https?:\/\/(www\.)?/, '').charAt(0).toUpperCase()}
              </span>
              <span className="w-14 truncate text-[10px] text-white/80">
                {site.title.replace(/^https?:\/\/(www\.)?/, '')}
              </span>
            </button>
          ))}

          <button
            type="button"
            onClick={() => setShowAddLink((v) => !v)}
            className="flex h-16 w-16 flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-white/20 bg-black/20 text-white/60 backdrop-blur-md transition-all hover:scale-105 hover:border-white/40 hover:text-white"
            title="Add shortcut"
            aria-label="Add shortcut"
          >
            <Plus size={18} />
          </button>
        </div>

        {/* Add-shortcut inline form */}
        {showAddLink && (
          <form
            onSubmit={(e) => { e.preventDefault(); submitQuickLink(); }}
            className="mt-4 flex items-center gap-2 rounded-2xl border border-white/10 bg-black/40 px-4 py-2.5 backdrop-blur-md"
          >
            <input
              value={linkTitle}
              onChange={(e) => setLinkTitle(e.target.value)}
              placeholder="Name"
              className="w-28 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs text-white placeholder-white/40 outline-none"
              spellCheck={false}
            />
            <input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="example.com"
              className="w-48 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs text-white placeholder-white/40 outline-none"
              spellCheck={false}
              autoFocus
            />
            <button
              type="submit"
              className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
            >
              Add
            </button>
            {linkError && <span className="text-[10px] text-red-300">{linkError}</span>}
          </form>
        )}
        </div>
      </div>

      {/* Floating action button (bottom-right) */}
      <button
        type="button" aria-label="Focus search"
        onClick={() => searchRef.current?.focus()}
        className="absolute bottom-6 right-6 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-800 shadow-2xl transition-all duration-200 hover:bg-gray-100 hover:scale-105 active:scale-95"
      >
        <Pencil size={20} />
      </button>
    </div>
  );
};
