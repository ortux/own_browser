import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Search } from 'lucide-react';
import { useSettingsStore } from '../stores/settingsStore';
import { takeImage, fetchNew } from '../lib/backgroundCache';
import type { PexelsImage } from '../../shared/types';
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
  {
    text: 'The future belongs to those who believe in the beauty of their dreams.',
    author: 'Eleanor Roosevelt',
  },
  { text: 'Strive not to be a success, but rather to be of value.', author: 'Albert Einstein' },
  { text: "You miss 100% of the shots you don't take.", author: 'Wayne Gretzky' },
  { text: "Whether you think you can or you think you can't, you're right.", author: 'Henry Ford' },
  { text: 'The mind is everything. What you think you become.', author: 'Buddha' },
  { text: 'An unexamined life is not worth living.', author: 'Socrates' },
  { text: 'Spread love everywhere you go.', author: 'Mother Teresa' },
  { text: 'Always remember that you are absolutely unique.', author: 'Margaret Mead' },
  {
    text: 'Do not go where the path may lead — go instead where there is no path.',
    author: 'Ralph Waldo Emerson',
  },
  {
    text: 'The greatest glory in living lies not in never falling, but in rising every time we fall.',
    author: 'Nelson Mandela',
  },
  {
    text: 'Never let the fear of striking out keep you from playing the game.',
    author: 'Babe Ruth',
  },
  { text: 'Life is either a daring adventure or nothing at all.', author: 'Helen Keller' },
  {
    text: "Many of life's failures are people who did not realize how close they were to success.",
    author: 'Thomas Edison',
  },
  { text: 'It always seems impossible until it is done.', author: 'Nelson Mandela' },
  { text: 'Do what you can, with what you have, where you are.', author: 'Theodore Roosevelt' },
  {
    text: "If you look at what you have in life, you'll always have more.",
    author: 'Oprah Winfrey',
  },
];

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Good night';
}

function getDailyQuote() {
  const day = Math.floor(Date.now() / 86_400_000);
  return QUOTES[day % QUOTES.length];
}

/*
 * Over a photo the text sits on a single flat scrim. The previous build
 * stacked a blur, a saturate, a radial mask and a per-element text-shadow to
 * solve the same contrast problem; one opaque layer is both cheaper and
 * easier to read.
 */
const PHOTO_TEXT = 'rgba(255,255,255,0.95)';
const PHOTO_TEXT_MUTED = 'rgba(255,255,255,0.7)';

/** Colour for text that may sit on either the theme background or a photo. */
function onPhoto(isPhoto: boolean, photo: string, token: string): string {
  return isPhoto ? photo : token;
}

// ── Component ─────────────────────────────────────────────────────────────────
export const NewTabPage: React.FC<NewTabPageProps> = ({ onSearch }) => {
  const newTabMode = useSettingsStore((s) => s.newTabMode);
  const backgroundCategory = useSettingsStore((s) => s.backgroundCategory);
  const account = useSettingsStore((s) => s.account);

  const [bg, setBg] = useState<PexelsImage | null>(null);
  const [bgVisible, setBgVisible] = useState(false);

  // ── Clock ──
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const isPhoto = newTabMode === 'full' && bg !== null && bgVisible;
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const date = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

  // ── Greeting + rotating quote ──
  const greeting = getGreeting();
  const [quote, setQuote] = useState(getDailyQuote);
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
  const [query, setQuery] = useState('');
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

  // ── Background ──
  useEffect(() => {
    if (newTabMode !== 'full') {
      setBg(null);
      setBgVisible(false);
      return;
    }
    const cached = takeImage(backgroundCategory);
    if (cached) {
      setBgVisible(false);
      setBg(cached);
      return;
    }
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

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="relative h-full w-full overflow-hidden bg-[var(--bg)]">
      {/* Brand lockup — top-left */}
      <div className="absolute left-6 top-5 z-10 flex items-center gap-2">
        <img
          src={appIcon}
          alt=""
          width={18}
          height={18}
          className="shrink-0 rounded-sm"
          draggable={false}
        />
        <span
          className="text-sm font-medium"
          style={{ color: onPhoto(isPhoto, PHOTO_TEXT, 'var(--text)') }}
        >
          Zyphora
        </span>
      </div>

      {/* Clock — top-right */}
      <div className="absolute right-6 top-5 z-10 text-right">
        <div
          className="text-2xl font-medium tabular-nums leading-none"
          style={{ color: onPhoto(isPhoto, PHOTO_TEXT, 'var(--text)') }}
        >
          {time}
        </div>
        <div
          className="mt-1 text-xs"
          style={{ color: onPhoto(isPhoto, PHOTO_TEXT_MUTED, 'var(--text-muted)') }}
        >
          {date}
        </div>
      </div>

      {/* Background image (full mode) */}
      {newTabMode === 'full' && (
        <>
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
          {/* Flat scrim so foreground text always clears contrast */}
          {bg && bgVisible && (
            <div
              className="pointer-events-none absolute inset-0"
              style={{ background: 'rgba(0,0,0,0.4)' }}
            />
          )}
          {bg && bgVisible && (
            <a
              href={bg.link}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => {
                e.preventDefault();
                if (bg.link) onSearch(bg.link);
              }}
              className="pointer-events-auto absolute bottom-4 left-6 z-20 max-w-[60%] truncate text-xs text-white/50 transition-colors hover:text-white/80"
              title={`Photo by ${bg.photographer} on Pexels`}
            >
              Photo by {bg.photographer} · Pexels
            </a>
          )}
        </>
      )}

      {/* Centre column: greeting + quote + search */}
      <div className="absolute left-1/2 top-1/2 z-10 w-full max-w-xl -translate-x-1/2 -translate-y-1/2 px-8">
        <div className="flex flex-col items-center">
          {/* Greeting */}
          <h1
            className="text-2xl font-medium tracking-tight"
            style={{ color: onPhoto(isPhoto, PHOTO_TEXT, 'var(--text)') }}
          >
            {greeting}, {account?.name ?? 'Guest'}
          </h1>

          {/* Quote — cross-fades every 30 s */}
          <div
            className="mt-2 max-w-md text-center transition-opacity duration-300"
            style={{ opacity: quoteVisible ? 1 : 0 }}
          >
            <p
              className="text-sm leading-relaxed"
              style={{ color: onPhoto(isPhoto, PHOTO_TEXT_MUTED, 'var(--text-muted)') }}
            >
              {quote.text}
            </p>
            <p
              className="mt-1 text-xs"
              style={{ color: onPhoto(isPhoto, 'rgba(255,255,255,0.55)', 'var(--text-faint)') }}
            >
              {quote.author}
            </p>
          </div>

          {/* Search */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
            className="mt-7 flex w-full items-center gap-2.5 rounded-md border px-3.5 py-2.5"
            style={{
              background: isPhoto ? 'rgba(20,20,22,0.72)' : 'var(--surface)',
              borderColor: isPhoto ? 'rgba(255,255,255,0.16)' : 'var(--border)',
            }}
          >
            {engineIcon ? (
              <img
                src={engineIcon}
                alt=""
                className="h-4 w-4 shrink-0 rounded-sm"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <Search
                size={16}
                className="shrink-0"
                style={{ color: onPhoto(isPhoto, PHOTO_TEXT_MUTED, 'var(--text-faint)') }}
              />
            )}
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search or enter address"
              className="flex-1 bg-transparent text-sm outline-none"
              style={{ color: onPhoto(isPhoto, PHOTO_TEXT, 'var(--text)') }}
              spellCheck={false}
            />
          </form>
        </div>
      </div>
    </div>
  );
};
