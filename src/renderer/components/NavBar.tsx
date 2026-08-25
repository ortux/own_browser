import React, { useState, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  X,
  Star,
  Lock,
  Search,
  Home,
  Shield,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';
import type { Tab } from '../../shared/types';
import type { CertInfo } from '../../main/certificate';
import { useSettingsStore } from '../stores/settingsStore';

interface NavBarProps {
  activeTab: Tab | undefined;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onStop: () => void;
  onNavigate: (url: string) => void;
  onOpenSettings: () => void;
  onHome: () => void;
  onBookmark?: () => void;
  isBookmarked?: boolean;
}

function looksLikeUrl(input: string): boolean {
  const trimmed = input.trim();
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('file://') ||
    trimmed.startsWith('about:') ||
    trimmed.startsWith('localhost')
  ) {
    return true;
  }
  return trimmed.includes('.') && !trimmed.includes(' ');
}

/** Strip protocol for a cleaner display when not focused */
function displayUrl(url: string): string {
  if (!url || url === 'about:blank') return '';
  return url.replace(/^https?:\/\//, '');
}

export const NavBar: React.FC<NavBarProps> = ({
  activeTab,
  onBack,
  onForward,
  onReload,
  onStop,
  onNavigate,
  onHome,
  onBookmark,
  isBookmarked = false,
}) => {
  const [input, setInput] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const buildSearchUrl = useSettingsStore((s) => s.buildSearchUrl);
  const getSearchEngine = useSettingsStore((s) => s.getSearchEngine);
  const engine = getSearchEngine();

  const isSecure = activeTab?.url?.startsWith('https://');
  const isLoading = activeTab?.loading;

  // ── Certificate / security shield ──
  const [cert, setCert] = useState<CertInfo | null>(null);
  const [certPending, setCertPending] = useState(false);
  const [showCert, setShowCert] = useState(false);

  const tabUrl = activeTab?.url;
  const isHttps = !!tabUrl && tabUrl.startsWith('https://');
  const tabHost = (() => {
    try {
      return tabUrl ? new URL(tabUrl).hostname : '';
    } catch {
      return '';
    }
  })();

  useEffect(() => {
    setShowCert(false);
    if (!isHttps || !tabHost) {
      setCert(null);
      setCertPending(false);
      return;
    }
    let cancelled = false;
    setCertPending(true);
    const fetchCert = async () => {
      try {
        const info = await window.browserAPI.cert.get(tabHost);
        if (!cancelled) {
          setCert(info);
          setCertPending(false);
        }
      } catch {
        if (!cancelled) setCertPending(false);
      }
    };
    // Cert is captured during the TLS handshake; query shortly after nav, retry once.
    const t1 = setTimeout(fetchCert, 400);
    const t2 = setTimeout(fetchCert, 1400);
    return () => {
      cancelled = true;
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [tabHost, isHttps, activeTab?.id, activeTab?.loading]);

  const certStatus: 'insecure' | 'pending' | 'secure' | 'invalid' = !isHttps
    ? 'insecure'
    : certPending
      ? 'pending'
      : cert?.present && cert.valid
        ? 'secure'
        : 'invalid';

  const shieldColor =
    certStatus === 'secure'
      ? 'text-green-400 hover:text-green-300'
      : certStatus === 'pending'
        ? 'text-[var(--text-faint)]'
        : 'text-red-400 hover:text-red-300';
  const ShieldIcon =
    certStatus === 'secure' ? ShieldCheck : certStatus === 'pending' ? Shield : ShieldAlert;
  const shieldTitle =
    certStatus === 'secure'
      ? 'Secure connection'
      : certStatus === 'pending'
        ? 'Checking connection…'
        : certStatus === 'insecure'
          ? 'Not secure (no HTTPS)'
          : 'Invalid certificate';

  useEffect(() => {
    if (!isFocused) {
      setInput(activeTab?.url && activeTab.url !== 'about:blank' ? activeTab.url : '');
    }
  }, [activeTab?.url, activeTab?.id, isFocused]);

  const handleFocus = () => {
    setIsFocused(true);
    // Show full URL when focused, select all
    setInput(activeTab?.url && activeTab.url !== 'about:blank' ? activeTab.url : '');
    setTimeout(() => {
      const el = document.activeElement as HTMLInputElement;
      el?.select();
    }, 0);
  };

  const handleBlur = () => {
    setIsFocused(false);
    // Restore stripped display URL
    setInput(activeTab?.url && activeTab.url !== 'about:blank' ? activeTab.url : '');
  };

  const handleSubmit = () => {
    const raw = input.trim();
    if (!raw) return;
    const url = looksLikeUrl(raw) ? raw : buildSearchUrl(raw);
    onNavigate(url);
    (document.activeElement as HTMLElement)?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSubmit();
    if (e.key === 'Escape') {
      setInput(activeTab?.url && activeTab.url !== 'about:blank' ? activeTab.url : '');
      (document.activeElement as HTMLElement)?.blur();
    }
  };

  return (
    <div className="flex items-center gap-1 px-2 py-1.5 bg-[var(--chrome)] border-t border-[var(--border)] shrink-0">
      {/* Navigation buttons */}
      <button
        onClick={onBack}
        disabled={!activeTab?.canGoBack}
        className="p-2 rounded-lg hover:bg-[var(--hover)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-[var(--text-muted)]"
        title="Back (Alt+Left)"
      >
        <ChevronLeft size={18} />
      </button>

      <button
        onClick={onForward}
        disabled={!activeTab?.canGoForward}
        className="p-2 rounded-lg hover:bg-[var(--hover)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-[var(--text-muted)]"
        title="Forward (Alt+Right)"
      >
        <ChevronRight size={18} />
      </button>

      {isLoading ? (
        <button
          onClick={onStop}
          className="p-2 rounded-lg hover:bg-[var(--hover)] transition-colors text-[var(--text-muted)]"
          title="Stop"
        >
          <X size={18} />
        </button>
      ) : (
        <button
          onClick={onReload}
          className="p-2 rounded-lg hover:bg-[var(--hover)] transition-colors text-[var(--text-muted)]"
          title="Reload (Ctrl+R)"
        >
          <RotateCcw size={16} />
        </button>
      )}

      {/* Home button */}
      <button
        onClick={onHome}
        className="p-2 rounded-lg hover:bg-[var(--hover)] transition-colors text-[var(--text-muted)] hover:text-[var(--text)]"
        title="Home (new tab)"
      >
        <Home size={16} />
      </button>

      {/* Address / search bar */}
      <div
        className={`flex-1 flex items-center gap-2 mx-1 px-3 py-1.5 rounded-lg border transition-all
          ${isFocused
            ? 'bg-[var(--surface-2)] border-blue-500 shadow-[0_0_0_2px_rgba(59,130,246,0.25)]'
            : 'bg-[var(--surface-2)] border-[var(--border)] hover:bg-[var(--hover)] hover:border-[var(--border-strong)]'
          }`}
      >
        {/* Lock / search icon */}
        {isFocused ? (
          <Search size={14} className="text-[var(--text-faint)] shrink-0" />
        ) : isSecure ? (
          <Lock size={13} className="text-green-400 shrink-0" />
        ) : (
          <Search size={14} className="text-[var(--text-faint)] shrink-0" />
        )}

        <input
          type="text"
          value={isFocused ? input : displayUrl(input)}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={`Search with ${engine.name} or enter URL…`}
          className="flex-1 bg-transparent outline-none text-sm min-w-0 text-[var(--text)] placeholder-[var(--text-faint)]"
          spellCheck={false}
        />

        {/* Loading indicator inside bar */}
        {isLoading && !isFocused && (
          <div className="w-3 h-3 rounded-full border-2 border-blue-400 border-t-transparent animate-spin shrink-0" />
        )}
      </div>

      {/* Security shield — reflects the site's TLS certificate */}
      <div className="relative shrink-0">
        <button
          onClick={() => setShowCert((v) => !v)}
          className={`p-2 rounded-lg hover:bg-[var(--hover)] transition-colors ${shieldColor}`}
          title={shieldTitle}
          aria-label="Connection security"
        >
          <ShieldIcon size={16} />
        </button>

        {showCert && (
          <div className="absolute bottom-full right-0 mb-2 w-72 rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-xl p-4 text-sm z-50">
            <div className="flex items-center gap-2 mb-3">
              <ShieldIcon size={16} className={shieldColor} />
              <span className="font-semibold">{shieldTitle}</span>
            </div>

            {certStatus === 'insecure' ? (
              <p className="text-[var(--text-muted)] leading-relaxed">
                This site is not using HTTPS. Your connection is not encrypted and
                could be intercepted by third parties.
              </p>
            ) : cert && cert.present ? (
              <dl className="space-y-2">
                <Row label="Issued to" value={cert.subject || '—'} />
                <Row label="Issuer" value={cert.issuer || '—'} />
                <Row
                  label="Valid from"
                  value={cert.validFrom ? new Date(cert.validFrom).toLocaleString() : '—'}
                />
                <Row
                  label="Valid to"
                  value={cert.validTo ? new Date(cert.validTo).toLocaleString() : '—'}
                />
                <Row label="Serial number" value={cert.serialNumber || '—'} mono />
                <Row label="Fingerprint" value={cert.fingerprint || '—'} mono />
                {certStatus === 'invalid' && cert.error && (
                  <p className="mt-1 text-xs text-red-400">Error: {cert.error}</p>
                )}
              </dl>
            ) : (
              <p className="text-[var(--text-muted)]">Certificate details unavailable.</p>
            )}
          </div>
        )}
      </div>

      {/* Bookmark */}
      <button
        onClick={onBookmark}
        className={`p-2 rounded-lg hover:bg-[var(--hover)] transition-colors ${
          isBookmarked
            ? 'text-yellow-400 hover:text-yellow-300'
            : 'text-[var(--text-muted)] hover:text-[var(--text)]'
        }`}
        title={isBookmarked ? 'Remove bookmark (Ctrl+D)' : 'Bookmark (Ctrl+D)'}
      >
        <Star
          size={16}
          fill={isBookmarked ? 'currentColor' : 'none'}
        />
      </button>

      {/* Account / menu */}
      
    </div>
  );
};

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">{label}</dt>
      <dd className={`text-[var(--text)] break-all ${mono ? 'font-mono text-[11px]' : ''}`}>
        {value}
      </dd>
    </div>
  );
}
